// Mesaj motoru (PROCESS_BATCH): toplanan mesajları tek seferde yanıtlar.
// Akış: kapı kontrolü → medya özetlerini bekle → talimat + geçmiş → AI (araçlarla) → yarış koruması → gönder → kredi düş.
import crypto from "node:crypto";
import type { DmMessage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiChat, AiError } from "./ai";
import type { AiTurn } from "./ai/types";
import type { DmAttachment, DmReferral } from "./channels/types";
import { aiGate, AI_GATE_LABEL } from "./batching";
import { canReply, turnCost, type TurnContent } from "./creditMath";
import { chargeUsage, getBalance } from "./credits";
import { getPricing } from "./pricing";
import { mediaKeysForMessage } from "./mediaKeys";
import { buildSystemPrompt } from "./prompt";
import { runTool, toolsFor, type ToolContext } from "./tools";
import { sendToConversation, typingOn, WindowClosedError } from "./send";
import { enqueue } from "./queue";
import { notifyDm } from "./notify";
import { publishDmEvent } from "./events";
import { appointmentContext } from "./modules";

const MEDIA_WAIT_EXTRA_MS = 30_000;

type Analyses = Map<string, { summary: string; createdAt: Date }>;

function describeMessage(m: DmMessage, analyses: Analyses): string {
  const lines: string[] = [];
  const atts = (Array.isArray(m.media) ? m.media : []) as unknown as DmAttachment[];
  const ref = (m.referral ?? undefined) as DmReferral | undefined;
  for (const k of mediaKeysForMessage(atts, ref)) {
    const a = analyses.get(k.key);
    const label = k.kind === "AD" ? "Kişi şu reklamdan geldi" : k.kind === "STORY" ? "Kişi şu hikâyeye yanıt verdi" : k.kind === "POST" ? "Kişi şu gönderiyi paylaştı" : k.kind === "VIDEO" ? "Kişi bir video gönderdi" : "Kişi bir görsel gönderdi";
    lines.push(`[${label}: ${a?.summary ?? "içerik henüz analiz edilmedi"}]`);
  }
  if (atts.some((a) => a.type === "audio")) lines.push("[Kişi bir ses kaydı gönderdi; ses dinlenemiyor, gerekirse yazmasını rica et.]");
  if (m.text) lines.push(m.text);
  return lines.join("\n") || "(boş mesaj)";
}

function contentKinds(batch: DmMessage[], analyses: Analyses, batchStart: Date): TurnContent[] {
  const kinds: TurnContent[] = [];
  for (const m of batch) {
    const atts = (Array.isArray(m.media) ? m.media : []) as unknown as DmAttachment[];
    const ref = (m.referral ?? undefined) as DmReferral | undefined;
    kinds.push("TEXT");
    for (const k of mediaKeysForMessage(atts, ref)) {
      const a = analyses.get(k.key);
      const cached = !!a && a.createdAt < batchStart; // önceden (başka sohbette) analiz edilmiş
      if (cached) kinds.push("CACHED_MEDIA");
      else if (k.kind === "VIDEO" || (k.kind === "AD" && ref?.videoUrl) || (k.kind === "POST" && atts.some((x) => x.type === "reel"))) kinds.push("VIDEO");
      else kinds.push("IMAGE");
    }
  }
  return kinds;
}

async function handoff(conversationId: string, clientId: string, clientName: string, reason: string) {
  await prisma.dmConversation.update({
    where: { id: conversationId },
    data: { mode: "HUMAN", waitingHuman: true, handoffReason: reason.slice(0, 200), pendingSince: null },
  });
  await notifyDm({ clientId, type: "DM_HANDOFF", toClient: true, fallbackToStaff: true, title: "Konuşma size devredildi", message: `${clientName}: ${reason.slice(0, 160)}` });
  await publishDmEvent({ clientId, conversationId, kind: "conversation" });
}

export async function processBatch(conversationId: string, attempt = 1) {
  const conv = await prisma.dmConversation.findUnique({
    where: { id: conversationId },
    include: { contact: true, client: { select: { id: true, name: true, dmManaged: true, dmPaused: true, dmModuleAppointment: true, dmModuleProducts: true } } },
  });
  if (!conv) return;
  const now = new Date();
  const client = conv.client;

  // Cevaplanmamış gelen mesajlar (son giden mesajdan sonraki, batchId'siz).
  const lastOut = await prisma.dmMessage.findFirst({ where: { conversationId, direction: "OUT", status: { not: "FAILED" } }, orderBy: { createdAt: "desc" } });
  const batch = await prisma.dmMessage.findMany({
    where: { conversationId, direction: "IN", batchId: null, ...(lastOut ? { createdAt: { gt: lastOut.createdAt } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (!batch.some((m) => m.sender === "CONTACT")) {
    await prisma.dmConversation.update({ where: { id: conversationId }, data: { pendingSince: null } });
    return;
  }

  const balance = await getBalance(client.id);
  const gate = aiGate({
    dmManaged: client.dmManaged, dmPaused: client.dmPaused, mode: conv.mode, aiBlocked: conv.contact.aiBlocked,
    canReply: canReply(balance), lastUserMessageAt: conv.lastUserMessageAt, now,
  });
  if (gate) {
    await prisma.dmConversation.update({
      where: { id: conversationId },
      data: { pendingSince: null, ...(gate === "NO_CREDIT" ? { waitingHuman: true, missedWhilePaused: true } : {}), ...(gate === "CLIENT_PAUSED" ? { missedWhilePaused: true } : {}) },
    });
    await publishDmEvent({ clientId: client.id, conversationId, kind: "conversation" });
    return;
  }

  // Medya özetleri: analiz sürüyorsa kısa süre daha bekle (toplam bekleme üst sınırını fazla aşmadan).
  const keys = batch.flatMap((m) => mediaKeysForMessage((Array.isArray(m.media) ? m.media : []) as unknown as DmAttachment[], (m.referral ?? undefined) as DmReferral | undefined)).map((k) => k.key);
  const history = await prisma.dmMessage.findMany({
    where: { conversationId, createdAt: { lt: batch[0].createdAt } },
    orderBy: { createdAt: "desc" },
    take: (await prisma.dmConfig.findUnique({ where: { clientId: client.id }, select: { historyLimit: true } }))?.historyLimit ?? 30,
  });
  history.reverse();
  const allKeys = [
    ...keys,
    ...history.flatMap((m) => mediaKeysForMessage((Array.isArray(m.media) ? m.media : []) as unknown as DmAttachment[], (m.referral ?? undefined) as DmReferral | undefined)).map((k) => k.key),
  ];
  const found = await prisma.dmMediaAnalysis.findMany({ where: { key: { in: allKeys } } });
  const analyses: Analyses = new Map(found.map((a) => [a.key, { summary: a.summary, createdAt: a.createdAt }]));
  const missing = keys.filter((k) => !analyses.has(k));
  if (missing.length && conv.pendingSince && now.getTime() - conv.pendingSince.getTime() < 60_000 + MEDIA_WAIT_EXTRA_MS) {
    const pendingJobs = await prisma.dmJob.count({
      where: { type: "ANALYZE_MEDIA", status: { in: ["PENDING", "RUNNING"] }, OR: missing.map((k) => ({ payload: { path: ["key"], equals: k } })) },
    });
    if (pendingJobs > 0) {
      await enqueue("PROCESS_BATCH", { conversationId }, { dedupeKey: `batch:${conversationId}`, runAt: new Date(Date.now() + 5000), keepEarlier: true });
      return;
    }
  }

  await typingOn(conversationId);
  const config = await prisma.dmConfig.findUnique({ where: { clientId: client.id } });
  let system = await buildSystemPrompt(client.id, now);
  if (client.dmModuleAppointment) {
    const ctxText = await appointmentContext(conversationId);
    if (ctxText) system += `\n\n${ctxText}`;
  }
  const turns: AiTurn[] = [];
  const push = (role: AiTurn["role"], text: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text += `\n${text}`;
    else turns.push({ role, text });
  };
  for (const m of history) {
    if (m.direction === "IN") push("user", describeMessage(m, analyses));
    else if (m.text) push("assistant", m.sender === "HUMAN" ? `[İşletme yetkilisi yazdı] ${m.text}` : m.text);
  }
  push("user", batch.map((m) => describeMessage(m, analyses)).join("\n"));
  if (turns[0]?.role === "assistant") turns.unshift({ role: "user", text: "(önceki konuşma)" });

  const available = toolsFor({ appointment: client.dmModuleAppointment, products: client.dmModuleProducts });
  const ctx: ToolContext = { clientId: client.id, clientName: client.name, conversationId, contactId: conv.contactId };
  const batchId = crypto.randomUUID();

  let result;
  try {
    result = await aiChat(
      "text",
      config?.textModel,
      { system, turns, tools: available.map((t) => t.def), executeTool: (call) => runTool(call, ctx, available), maxOutputTokens: 1500 },
      { clientId: client.id, kind: "TEXT_REPLY" }
    );
  } catch (e) {
    // Bir kez yeniden denenir (iş tekrar kuyruğa girer); yine olmazsa insana devredilir, kredi düşmez.
    if (e instanceof AiError && e.retryable && attempt < 2) throw e;
    await handoff(conversationId, client.id, client.name, `AI cevap üretemedi: ${e instanceof Error ? e.message.slice(0, 120) : "hata"}`);
    return;
  }

  // Yarış koruması: cevap hazırlanırken yeni mesaj geldiyse bu cevap atılır; toplama yeni mesajla baştan başlar.
  const newer = await prisma.dmMessage.count({ where: { conversationId, direction: "IN", sender: "CONTACT", createdAt: { gt: batch[batch.length - 1].createdAt } } });
  if (newer > 0) return;
  const fresh = await prisma.dmConversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  if (fresh.mode === "HUMAN" || fresh.contact.aiBlocked) return; // bu arada insan devraldı

  if (ctx.hotLead) {
    await prisma.dmConversation.update({ where: { id: conversationId }, data: { hotLead: true, summary: ctx.hotLead } });
    await notifyDm({ clientId: client.id, type: "DM_HOT_LEAD", toClient: true, fallbackToStaff: true, title: "Sıcak müşteri", message: `${client.name}: ${ctx.hotLead.slice(0, 180)}` });
  }

  const text = result.text.trim();
  if (result.refused || (!text && !ctx.handoff)) {
    await prisma.dmMessage.updateMany({ where: { id: { in: batch.map((m) => m.id) } }, data: { batchId } });
    await handoff(conversationId, client.id, client.name, result.refused ? "AI bu mesaja güvenlik nedeniyle cevap vermedi" : "AI cevap üretmedi");
    return;
  }

  let sentId: string | null = null;
  if (text) {
    try {
      const sent = await sendToConversation({
        conversationId, text, sender: "AI", batchId,
        ai: { model: result.ref, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.costUsd },
      });
      sentId = sent.id;
    } catch (e) {
      if (e instanceof WindowClosedError) {
        await prisma.dmConversation.update({ where: { id: conversationId }, data: { pendingSince: null } });
        return;
      }
      throw e;
    }
    const pricing = await getPricing();
    const cost = turnCost(contentKinds(batch, analyses, batch[0].createdAt), pricing);
    const charge = await chargeUsage({ clientId: client.id, cost, idempotencyKey: `usage:${batchId}`, conversationId, messageId: sentId, note: `AI cevabı (${cost} kredi)` });
    await prisma.dmMessage.update({ where: { id: sentId }, data: { creditCost: charge.charged } });
  }

  await prisma.dmMessage.updateMany({ where: { id: { in: batch.map((m) => m.id) } }, data: { batchId } });
  await prisma.dmConversation.update({
    where: { id: conversationId },
    data: {
      pendingSince: null, waitingHuman: false, missedWhilePaused: false,
      ...(ctx.appointmentRequested ? { appointmentRequested: true } : {}),
    },
  });
  if (ctx.handoff) await handoff(conversationId, client.id, client.name, ctx.handoff);
  await publishDmEvent({ clientId: client.id, conversationId, kind: "message" });
}

export { AI_GATE_LABEL };
