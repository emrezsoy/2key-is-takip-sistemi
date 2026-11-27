// Gelen kutusu ve bekleyen işler verileri (admin ve müşteri panelinde ortak).
import { prisma } from "@/lib/prisma";
import type { DmAttachment, DmReferral } from "./channels/types";
import { mediaKeysForMessage } from "./mediaKeys";
import { windowEndsAt, windowOpen } from "./batching";

export type InboxConversation = {
  id: string;
  channel: "INSTAGRAM" | "FACEBOOK";
  name: string;
  username: string | null;
  /** Profil fotoğrafı (Meta'dan). */
  avatar: string | null;
  mode: "AI" | "HUMAN";
  aiBlocked: boolean;
  unread: number;
  waitingHuman: boolean;
  hotLead: boolean;
  appointmentRequested: boolean;
  handoffReason: string | null;
  lastText: string;
  lastAt: Date | null;
  windowEndsAt: Date | null;
};

export type InboxMessage = {
  id: string;
  direction: "IN" | "OUT";
  sender: "CONTACT" | "AI" | "HUMAN" | "SYSTEM";
  text: string | null;
  media: { type: string; url?: string; summary?: string }[];
  referral: { label: string; summary?: string } | null;
  status: "PENDING" | "SENT" | "FAILED";
  error: string | null;
  creditCost: number | null;
  sentByName: string | null;
  createdAt: Date;
};

const contactName = (c: { name: string | null; username: string | null; externalId: string }) =>
  c.name ?? (c.username ? `@${c.username}` : `Kişi ${c.externalId.slice(-4)}`);

export async function loadInbox(clientId: string, filter: string | undefined) {
  const where = {
    clientId,
    ...(filter === "insan" ? { OR: [{ waitingHuman: true }, { mode: "HUMAN" as const }] } : {}),
    ...(filter === "sicak" ? { hotLead: true } : {}),
    ...(filter === "randevu" ? { appointmentRequested: true } : {}),
  };
  const rows = await prisma.dmConversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, direction: true, media: true } },
    },
  });
  const now = new Date();
  return rows.map(
    (c): InboxConversation => ({
      id: c.id,
      channel: c.channel,
      name: contactName(c.contact),
      username: c.contact.username,
      avatar: c.contact.profilePic,
      mode: c.mode,
      aiBlocked: c.contact.aiBlocked,
      unread: c.unreadCount,
      waitingHuman: c.waitingHuman,
      hotLead: c.hotLead,
      appointmentRequested: c.appointmentRequested,
      handoffReason: c.handoffReason,
      lastText: (c.messages[0]?.text ?? (c.messages[0]?.media ? "📎 medya" : "")).slice(0, 90),
      lastAt: c.lastMessageAt,
      windowEndsAt: c.lastUserMessageAt && windowOpen(c.lastUserMessageAt, now, 0) ? windowEndsAt(c.lastUserMessageAt) : null,
    })
  );
}

export async function loadConversation(clientId: string, conversationId: string) {
  const conv = await prisma.dmConversation.findFirst({ where: { id: conversationId, clientId }, include: { contact: true } });
  if (!conv) return null;
  const msgs = await prisma.dmMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 150 });
  msgs.reverse();
  const keys = msgs.flatMap((m) => mediaKeysForMessage((Array.isArray(m.media) ? m.media : []) as unknown as DmAttachment[], (m.referral ?? undefined) as DmReferral | undefined));
  const analyses = new Map((await prisma.dmMediaAnalysis.findMany({ where: { key: { in: keys.map((k) => k.key) } } })).map((a) => [a.key, a.summary]));
  const messages = msgs.map((m): InboxMessage => {
    const atts = (Array.isArray(m.media) ? m.media : []) as unknown as DmAttachment[];
    const ref = (m.referral ?? undefined) as DmReferral | undefined;
    const mk = mediaKeysForMessage(atts, ref);
    const adKey = mk.find((k) => k.kind === "AD" || k.kind === "STORY" || (k.kind === "POST" && ref?.postId));
    return {
      id: m.id,
      direction: m.direction,
      sender: m.sender,
      text: m.text,
      media: atts.map((a) => ({ type: a.type, url: a.url, summary: mk.find((k) => k.url === a.url) ? analyses.get(mk.find((k) => k.url === a.url)!.key) : undefined })),
      referral: ref
        ? { label: ref.adId ? `Reklam: ${ref.adTitle ?? ref.adId}` : ref.storyId ? "Hikâye yanıtı" : ref.postId ? "Gönderi" : "Bağlantı", summary: adKey ? analyses.get(adKey.key) : undefined }
        : null,
      status: m.status,
      error: m.error,
      creditCost: m.creditCost,
      sentByName: m.sentByName,
      createdAt: m.createdAt,
    };
  });
  return {
    id: conv.id,
    channel: conv.channel,
    name: contactName(conv.contact),
    avatar: conv.contact.profilePic,
    contact: { id: conv.contact.id, phone: conv.contact.phone, email: conv.contact.email, aiBlocked: conv.contact.aiBlocked, username: conv.contact.username },
    mode: conv.mode,
    handoffReason: conv.handoffReason,
    waitingHuman: conv.waitingHuman,
    summary: conv.summary,
    windowEndsAt: conv.lastUserMessageAt ? windowEndsAt(conv.lastUserMessageAt) : null,
    windowOpen: windowOpen(conv.lastUserMessageAt, new Date(), 0),
    messages,
  };
}

export async function loadPending(clientId: string) {
  const now = new Date();
  const [questions, appointments, followUps, missedRaw] = await Promise.all([
    prisma.dmOwnerQuestion.findMany({ where: { clientId, status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { conversation: { include: { contact: true } } } }),
    prisma.dmAppointment.findMany({ where: { clientId, status: "REQUESTED" }, orderBy: { startAt: "asc" }, include: { contact: true } }),
    prisma.dmFollowUp.findMany({ where: { clientId, status: "PENDING_APPROVAL" }, orderBy: { windowEndsAt: "asc" }, include: { conversation: { include: { contact: true } } } }),
    prisma.dmConversation.findMany({ where: { clientId, missedWhilePaused: true }, include: { contact: true }, orderBy: { lastUserMessageAt: "desc" } }),
  ]);
  // Cevapsız kalanlar: son mesaj kişiden, insan cevap vermemiş ve pencere hâlâ açık.
  const missed = [];
  for (const c of missedRaw) {
    if (!windowOpen(c.lastUserMessageAt, now)) continue;
    const last = await prisma.dmMessage.findFirst({ where: { conversationId: c.id }, orderBy: { createdAt: "desc" } });
    if (!last || last.direction !== "IN") continue;
    missed.push({ id: c.id, name: contactName(c.contact), lastText: (last.text ?? "📎 medya").slice(0, 120), windowEndsAt: windowEndsAt(c.lastUserMessageAt!) });
  }
  return {
    questions: questions.map((q) => ({ id: q.id, question: q.question, conversationId: q.conversationId, name: contactName(q.conversation.contact), createdAt: q.createdAt })),
    appointments: appointments.map((a) => ({
      id: a.id, startAt: a.startAt, endAt: a.endAt, customerName: a.customerName ?? (a.contact ? contactName(a.contact) : "—"),
      customerPhone: a.customerPhone, service: a.service, note: a.note, conversationId: a.conversationId,
    })),
    followUps: followUps.map((f) => ({ id: f.id, text: f.text, reason: f.reason, scheduledAt: f.scheduledAt, windowEndsAt: f.windowEndsAt, name: contactName(f.conversation.contact), conversationId: f.conversationId })),
    missed,
  };
}
