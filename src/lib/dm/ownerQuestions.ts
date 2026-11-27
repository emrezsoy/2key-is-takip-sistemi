// AI'ın bilmediği soru (ask_owner): işletme sahibi panelden cevaplar → cevap bilgi bankasına eklenir →
// 24 saat penceresi açıksa AI cevabı kişiye iletir (SEND_OWNER_ANSWER işi).
import { prisma } from "@/lib/prisma";
import { aiChat } from "./ai";
import { windowOpen } from "./batching";
import { chargeUsage } from "./credits";
import { getPricing } from "./pricing";
import { buildSystemPrompt } from "./prompt";
import { enqueue } from "./queue";
import { sendToConversation, WindowClosedError } from "./send";
import { publishDmEvent } from "./events";

export async function answerOwnerQuestion(input: { questionId: string; answer: string; byName: string; saveToKnowledge: boolean }) {
  const answer = input.answer.trim().slice(0, 2000);
  if (!answer) throw new Error("Cevap boş olamaz.");
  const q = await prisma.dmOwnerQuestion.findUnique({ where: { id: input.questionId } });
  if (!q) throw new Error("Soru bulunamadı.");
  if (q.status !== "PENDING") throw new Error("Bu soru zaten cevaplanmış.");
  let knowledgeItemId: string | null = null;
  if (input.saveToKnowledge) {
    const k = await prisma.dmKnowledgeItem.create({
      data: { clientId: q.clientId, question: q.question, answer, source: "OWNER_ANSWER", createdByName: input.byName },
    });
    knowledgeItemId = k.id;
  }
  await prisma.dmOwnerQuestion.update({
    where: { id: q.id },
    data: { answer, status: "ANSWERED", answeredByName: input.byName, answeredAt: new Date(), knowledgeItemId },
  });
  await enqueue("SEND_OWNER_ANSWER", { questionId: q.id });
  await publishDmEvent({ clientId: q.clientId, conversationId: q.conversationId, kind: "pending" });
}

export async function dismissOwnerQuestion(questionId: string, byName: string) {
  const q = await prisma.dmOwnerQuestion.update({ where: { id: questionId }, data: { status: "CLOSED", answeredByName: byName, answeredAt: new Date() } });
  await publishDmEvent({ clientId: q.clientId, conversationId: q.conversationId, kind: "pending" });
}

/** SEND_OWNER_ANSWER işi. Konuşma insana geçtiyse ya da pencere kapandıysa gönderilmez. */
export async function sendOwnerAnswer(questionId: string) {
  const q = await prisma.dmOwnerQuestion.findUnique({ where: { id: questionId }, include: { conversation: { include: { contact: true, client: true } } } });
  if (!q || !q.answer) return;
  const conv = q.conversation;
  if (conv.mode === "HUMAN" || conv.contact.aiBlocked || !windowOpen(conv.lastUserMessageAt, new Date())) {
    await prisma.dmOwnerQuestion.update({ where: { id: q.id }, data: { status: "CLOSED" } });
    return;
  }
  const config = await prisma.dmConfig.findUnique({ where: { clientId: conv.clientId } });
  const system = await buildSystemPrompt(conv.clientId);
  const r = await aiChat(
    "text",
    config?.textModel,
    {
      system,
      turns: [{
        role: "user",
        text: `Daha önce kişiye "kontrol edip döneceğim" dedin. İşletme sahibi şu soruya cevap verdi.\nSoru: ${q.question}\nCevap: ${q.answer}\nBu cevabı kişiye kısa ve doğal bir mesajla ilet (cevabı değiştirme, ek bilgi uydurma).`,
      }],
      maxOutputTokens: 600,
    },
    { clientId: conv.clientId, kind: "TEXT_REPLY" }
  );
  const text = r.text.trim() || q.answer;
  try {
    const sent = await sendToConversation({
      conversationId: conv.id, text, sender: "AI",
      ai: { model: r.ref, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.costUsd },
    });
    const pricing = await getPricing();
    const charge = await chargeUsage({ clientId: conv.clientId, cost: pricing.textCost, idempotencyKey: `owner:${q.id}`, conversationId: conv.id, messageId: sent.id, note: "Sahip cevabının iletilmesi" });
    await prisma.dmMessage.update({ where: { id: sent.id }, data: { creditCost: charge.charged } });
  } catch (e) {
    if (e instanceof WindowClosedError) {
      await prisma.dmOwnerQuestion.update({ where: { id: q.id }, data: { status: "CLOSED" } });
      return;
    }
    throw e;
  }
}
