"use server";

// Gelen kutusu işlemleri: panelden cevap, devral / AI'a geri ver, "AI cevap vermesin", okundu, sahibe soru cevabı,
// AI aç/kapat, cevapsız kalanları seçerek cevaplatma. Admin, yetkili ekip üyesi ve müşterinin kendisi kullanabilir.
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireDmActor } from "@/lib/dm/access";
import { sendToConversation, WindowClosedError } from "@/lib/dm/send";
import { answerOwnerQuestion, dismissOwnerQuestion } from "@/lib/dm/ownerQuestions";
import { enqueue } from "@/lib/dm/queue";
import { publishDmEvent } from "@/lib/dm/events";
import { windowOpen } from "@/lib/dm/batching";

async function actorFor(clientId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  return requireDmActor(session.user, clientId, { allowClient: true });
}

async function convActor(conversationId: string) {
  const conv = await prisma.dmConversation.findUnique({ where: { id: conversationId }, select: { id: true, clientId: true, contactId: true } });
  if (!conv) throw new Error("Konuşma bulunamadı.");
  return { conv, actor: await actorFor(conv.clientId) };
}

const refresh = () => {
  revalidatePath("/mesaj-otomasyonu", "layout");
  revalidatePath("/panel/mesajlar");
  revalidatePath("/mesaj", "layout");
};

/** Panelden cevap: gönderilir, konuşma insana geçer (AI karışmaz). */
export async function sendHumanReply(conversationId: string, text: string) {
  const { conv, actor } = await convActor(conversationId);
  const body = text.trim();
  if (!body) throw new Error("Mesaj boş olamaz.");
  if (body.length > 1000) throw new Error("Mesaj en fazla 1000 karakter olabilir.");
  try {
    await sendToConversation({ conversationId, text: body, sender: "HUMAN", sentById: actor.id, sentByName: actor.name });
  } catch (e) {
    if (e instanceof WindowClosedError) throw new Error(e.message);
    throw new Error(`Gönderilemedi: ${e instanceof Error ? e.message : "hata"}`);
  }
  await prisma.dmConversation.update({
    where: { id: conv.id },
    data: { mode: "HUMAN", waitingHuman: false, missedWhilePaused: false, pendingSince: null, unreadCount: 0, handoffReason: null },
  });
  await prisma.dmJob.deleteMany({ where: { dedupeKey: `batch:${conv.id}`, status: "PENDING" } });
  refresh();
}

export async function setConversationMode(conversationId: string, mode: "AI" | "HUMAN") {
  const { conv } = await convActor(conversationId);
  await prisma.dmConversation.update({
    where: { id: conv.id },
    data: mode === "AI" ? { mode: "AI", waitingHuman: false, handoffReason: null } : { mode: "HUMAN", pendingSince: null },
  });
  if (mode === "HUMAN") await prisma.dmJob.deleteMany({ where: { dedupeKey: `batch:${conv.id}`, status: "PENDING" } });
  await publishDmEvent({ clientId: conv.clientId, conversationId, kind: "conversation" });
  refresh();
}

export async function setContactAiBlocked(conversationId: string, blocked: boolean) {
  const { conv } = await convActor(conversationId);
  await prisma.dmContact.update({ where: { id: conv.contactId }, data: { aiBlocked: blocked } });
  if (blocked) await prisma.dmJob.deleteMany({ where: { dedupeKey: `batch:${conv.id}`, status: "PENDING" } });
  refresh();
}

export async function markConversationRead(conversationId: string) {
  const { conv } = await convActor(conversationId);
  await prisma.dmConversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } });
}

export async function answerQuestionAction(questionId: string, answer: string, saveToKnowledge: boolean) {
  const q = await prisma.dmOwnerQuestion.findUnique({ where: { id: questionId }, select: { clientId: true } });
  if (!q) throw new Error("Soru bulunamadı.");
  const actor = await actorFor(q.clientId);
  await answerOwnerQuestion({ questionId, answer, byName: actor.name, saveToKnowledge });
  refresh();
}

export async function dismissQuestionAction(questionId: string) {
  const q = await prisma.dmOwnerQuestion.findUnique({ where: { id: questionId }, select: { clientId: true } });
  if (!q) throw new Error("Soru bulunamadı.");
  const actor = await actorFor(q.clientId);
  await dismissOwnerQuestion(questionId, actor.name);
  refresh();
}

/** Müşterinin AI aç/kapat anahtarı. */
export async function setDmPaused(clientId: string, paused: boolean) {
  await actorFor(clientId);
  await prisma.client.update({ where: { id: clientId }, data: { dmPaused: paused } });
  refresh();
}

/** Duraklama sonrası cevapsız kalan konuşmalardan seçilenler cevaplanır; seçilmeyenler listeden çıkar. */
export async function replyMissedConversations(clientId: string, selectedIds: string[], dismissIds: string[]) {
  await actorFor(clientId);
  const now = new Date();
  const convs = await prisma.dmConversation.findMany({ where: { clientId, id: { in: [...selectedIds, ...dismissIds] }, missedWhilePaused: true } });
  let queued = 0;
  for (const c of convs) {
    if (selectedIds.includes(c.id) && windowOpen(c.lastUserMessageAt, now)) {
      await prisma.dmConversation.update({ where: { id: c.id }, data: { missedWhilePaused: false, waitingHuman: false, mode: "AI", pendingSince: now } });
      await enqueue("PROCESS_BATCH", { conversationId: c.id }, { dedupeKey: `batch:${c.id}` });
      queued++;
    } else {
      await prisma.dmConversation.update({ where: { id: c.id }, data: { missedWhilePaused: false } });
    }
  }
  refresh();
  return queued;
}
