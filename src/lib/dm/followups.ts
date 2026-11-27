// Takip mesajları: sessiz kalan konuşma sınıflandırılır (PURCHASED / UNDECIDED / INFO_DONE / PERSONAL / SPAM);
// yalnızca kararsızlar için kişiye özel takip mesajı hazırlanır, işletme onaylar (ya da otomatik), pencere içinde
// ve aralıklı (20-60 sn) gönderilir. Penceresi kaçanlar "kaçan fırsat" olur, kredi düşmez.
import { prisma } from "@/lib/prisma";
import { aiChat } from "./ai";
import { followUpTime } from "./followupMath";
import { windowEndsAt, windowOpen } from "./batching";
import { localDay } from "./availability";
import { localParts } from "./hours";
import { sendToConversation, WindowClosedError } from "./send";
import { chargeUsage, getBalance } from "./credits";
import { canReply } from "./creditMath";
import { getPricing } from "./pricing";
import { notifyDm } from "./notify";
import { publishDmEvent } from "./events";
import { registerScheduledTask } from "./scheduler";

const CLASSES = ["PURCHASED", "UNDECIDED", "INFO_DONE", "PERSONAL", "SPAM"] as const;

const CLASSIFY_SYSTEM = `Bir işletmenin Instagram/Facebook mesaj konuşmasını inceliyorsun. Konuşma bir süredir sessiz.
Konuşmayı şu sınıflardan birine koy: PURCHASED (satın aldı / randevu kesinleşti), UNDECIDED (ilgilendi ama karar vermedi),
INFO_DONE (bilgi aldı, iş bitti), PERSONAL (müşteri değil, kişisel sohbet), SPAM.
Yalnızca UNDECIDED ise, kişiye özel, değer sunan ve kovalamayan (baskı yapmayan), kısa bir takip mesajı yaz (işletmenin ağzından, kişinin dilinde).
Fiyat, stok, kampanya uydurma; konuşmada geçmeyen bilgi ekleme.
Sadece JSON döndür: {"classification": "...", "summary": "konuşmanın tek cümlelik özeti", "followUp": "takip mesajı ya da boş"}`;

/** Sessiz kalan konuşmaları sınıflandırır, kararsızlar için takip hazırlar (zamanlayıcı, 10 dk'da bir). */
export async function classifySilentConversations(now = new Date()) {
  const configs = await prisma.dmConfig.findMany({
    where: { followUpEnabled: true, client: { dmManaged: true, dmPaused: false, isActive: true } },
    include: { client: { select: { id: true, name: true } } },
  });
  for (const cfg of configs) {
    const silentBefore = new Date(now.getTime() - cfg.followUpSilenceMin * 60_000);
    const convs = await prisma.dmConversation.findMany({
      where: {
        clientId: cfg.clientId, mode: "AI", classification: "UNKNOWN", waitingHuman: false,
        lastMessageAt: { lt: silentBefore }, lastUserMessageAt: { gt: new Date(now.getTime() - 24 * 3600_000) },
        contact: { aiBlocked: false },
      },
      take: 30,
    });
    for (const c of convs) {
      // Kişi başına, son mesajından sonra en fazla 1 takip.
      if (await prisma.dmFollowUp.count({ where: { conversationId: c.id, createdAt: { gt: c.lastUserMessageAt! } } })) {
        await prisma.dmConversation.update({ where: { id: c.id }, data: { classification: "UNDECIDED", classifiedAt: now } });
        continue;
      }
      const msgs = await prisma.dmMessage.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: "desc" }, take: 30 });
      msgs.reverse();
      const transcript = msgs.map((m) => `${m.direction === "IN" ? "Kişi" : "İşletme"}: ${m.text ?? "(medya)"}`).join("\n");
      let parsed: { classification?: string; summary?: string; followUp?: string } = {};
      try {
        const r = await aiChat("classify", cfg.classifyModel, { system: CLASSIFY_SYSTEM, turns: [{ role: "user", text: `İşletme: ${cfg.client.name}\n\n${transcript}` }], json: true, maxOutputTokens: 600 }, { clientId: cfg.clientId, kind: "CLASSIFY" });
        parsed = JSON.parse(r.text.replace(/^```(json)?|```$/g, "").trim());
      } catch {
        continue; // sonraki turda tekrar denenir
      }
      const cls = (CLASSES as readonly string[]).includes(parsed.classification ?? "") ? (parsed.classification as (typeof CLASSES)[number]) : "INFO_DONE";
      await prisma.dmConversation.update({ where: { id: c.id }, data: { classification: cls, classifiedAt: now, summary: parsed.summary?.slice(0, 500) ?? c.summary } });
      if (cls !== "UNDECIDED" || !parsed.followUp?.trim()) continue;
      const when = followUpTime({
        lastUserMessageAt: c.lastUserMessageAt!, now,
        cfg: { morningStart: cfg.followUpMorningStart, morningEnd: cfg.followUpMorningEnd, eveningStart: cfg.followUpEveningStart, eveningEnd: cfg.followUpEveningEnd, quietStart: cfg.quietStart, quietEnd: cfg.quietEnd },
      });
      await prisma.dmFollowUp.create({
        data: {
          clientId: cfg.clientId, conversationId: c.id, reason: parsed.summary?.slice(0, 300) ?? null, text: parsed.followUp.trim().slice(0, 1000),
          scheduledAt: "at" in when ? when.at : now, windowEndsAt: windowEndsAt(c.lastUserMessageAt!),
          status: "skip" in when ? "SKIPPED_EXPIRED" : cfg.followUpAutoApprove ? "APPROVED" : "PENDING_APPROVAL",
        },
      });
      await publishDmEvent({ clientId: cfg.clientId, conversationId: c.id, kind: "pending" });
    }
  }
}

/** Sabah (ayarlanan saatte) işletmeye tek bildirim: "Bugün X kişiye takip mesajı gidecek, onaylıyor musun?" */
export async function notifyFollowUpApprovals(now = new Date()) {
  const configs = await prisma.dmConfig.findMany({ where: { followUpEnabled: true, followUpAutoApprove: false, client: { dmManaged: true } }, include: { client: { select: { name: true } } } });
  const { hm, date } = localParts(now);
  for (const cfg of configs) {
    if (hm < cfg.followUpNotifyTime) continue;
    const count = await prisma.dmFollowUp.count({ where: { clientId: cfg.clientId, status: "PENDING_APPROVAL" } });
    if (!count) continue;
    const marker = `fu-notify:${cfg.clientId}:${date}`;
    if (await prisma.dmJob.findFirst({ where: { type: "NOTIFY_MARKER", payload: { equals: { marker } } } })) continue;
    await prisma.dmJob.create({ data: { type: "NOTIFY_MARKER", payload: { marker }, status: "DONE" } });
    await notifyDm({
      clientId: cfg.clientId, type: "DM_FOLLOWUP_APPROVAL", toClient: true, fallbackToStaff: true,
      title: "Takip mesajları onay bekliyor", message: `${cfg.client.name}: bugün ${count} kişiye takip mesajı gidecek. Onaylıyor musunuz? (Mesajlar → Bekleyen işler)`,
    });
  }
}

const nextAllowed = new Map<string, number>();

/** Onaylı takipleri gönderir: penceresi en erken kapanandan başlayarak, aynı işletmede mesajlar arası 20-60 sn. */
export async function sendDueFollowUps(now = new Date()) {
  // Onay bekleyip penceresi kaçanlar.
  const expired = await prisma.dmFollowUp.updateMany({
    where: { status: { in: ["PENDING_APPROVAL", "APPROVED"] }, windowEndsAt: { lt: new Date(now.getTime() + 30 * 60_000) } },
    data: { status: "SKIPPED_EXPIRED" },
  });
  void expired;
  const due = await prisma.dmFollowUp.findMany({
    where: { status: "APPROVED", scheduledAt: { lte: now } },
    orderBy: { windowEndsAt: "asc" },
    include: { conversation: { include: { contact: true, client: { select: { dmManaged: true, dmPaused: true } } } } },
    take: 20,
  });
  for (const f of due) {
    if ((nextAllowed.get(f.clientId) ?? 0) > Date.now()) continue;
    const conv = f.conversation;
    const userWroteAgain = conv.lastUserMessageAt && conv.lastUserMessageAt > f.createdAt;
    if (userWroteAgain || conv.mode === "HUMAN" || conv.contact.aiBlocked || !conv.client.dmManaged || conv.client.dmPaused) {
      await prisma.dmFollowUp.update({ where: { id: f.id }, data: { status: "REJECTED", error: userWroteAgain ? "Kişi yeniden yazdı" : "Konuşma insanda / AI kapalı" } });
      continue;
    }
    if (!windowOpen(conv.lastUserMessageAt, now)) {
      await prisma.dmFollowUp.update({ where: { id: f.id }, data: { status: "SKIPPED_EXPIRED" } });
      continue;
    }
    if (!canReply(await getBalance(f.clientId))) continue; // kredi yok: pencere kaçarsa kaçan fırsat olur
    nextAllowed.set(f.clientId, Date.now() + (20 + Math.floor(Math.random() * 40)) * 1000);
    try {
      const sent = await sendToConversation({ conversationId: conv.id, text: f.text, sender: "AI" });
      const pricing = await getPricing();
      const charge = await chargeUsage({ clientId: f.clientId, cost: pricing.followUpCost, idempotencyKey: `followup:${f.id}`, conversationId: conv.id, messageId: sent.id, note: "Takip mesajı" });
      await prisma.dmMessage.update({ where: { id: sent.id }, data: { creditCost: charge.charged } });
      await prisma.dmFollowUp.update({ where: { id: f.id }, data: { status: "SENT", sentAt: new Date(), messageId: sent.id } });
    } catch (e) {
      await prisma.dmFollowUp.update({
        where: { id: f.id },
        data: e instanceof WindowClosedError ? { status: "SKIPPED_EXPIRED" } : { error: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
      });
    }
  }
}

/** AI dururken (kredi bitti / kapalı) günde bir "cevapsız kalanlar" özeti (akşam 18:00 sonrası). */
export async function sendDailyMissedSummaries(now = new Date()) {
  const { hm, date } = localParts(now);
  if (hm < "18:00") return;
  const configs = await prisma.dmConfig.findMany({ where: { client: { dmManaged: true } }, include: { client: { select: { name: true, dmPaused: true } } } });
  for (const cfg of configs) {
    if (!cfg.stoppedAt && !cfg.client.dmPaused) continue;
    if (cfg.dailyMissedAt && localDay(cfg.dailyMissedAt).date === date) continue;
    const count = await prisma.dmConversation.count({ where: { clientId: cfg.clientId, missedWhilePaused: true } });
    if (!count) continue;
    await prisma.dmConfig.update({ where: { id: cfg.id }, data: { dailyMissedAt: now } });
    await notifyDm({
      clientId: cfg.clientId, type: "DM_DAILY_MISSED", toClient: true, toStaff: !!cfg.stoppedAt,
      title: "Cevapsız kalan mesajlar",
      message: `${cfg.client.name}: AI ${cfg.stoppedAt ? "kredi bittiği için" : "kapalı olduğu için"} ${count} konuşma cevapsız bekliyor.`,
    });
  }
}

registerScheduledTask({ name: "sınıflandırma", everyMs: 10 * 60_000, run: (now) => classifySilentConversations(now) });
registerScheduledTask({ name: "takip onay bildirimi", everyMs: 10 * 60_000, run: (now) => notifyFollowUpApprovals(now) });
registerScheduledTask({ name: "takip gönderimi", everyMs: 60_000, run: (now) => sendDueFollowUps(now) });
registerScheduledTask({ name: "günlük cevapsız özeti", everyMs: 30 * 60_000, run: (now) => sendDailyMissedSummaries(now) });
