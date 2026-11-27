// Giden mesaj: 24 saat penceresini kontrol eder, kanala gönderir, kaydeder ve canlı akışa haber verir.
import type { DmSender, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getChannelSender } from "./channels";
import { windowOpen } from "./batching";
import { MetaDmError } from "./metaDm";
import { publishDmEvent } from "./events";

export class WindowClosedError extends Error {
  readonly retryable = false;
  constructor() {
    super("24 saat penceresi kapandı; Meta bu kişiye artık mesaj gönderilmesine izin vermiyor.");
  }
}

export async function sendToConversation(input: {
  conversationId: string;
  text?: string;
  imageUrl?: string;
  sender: Extract<DmSender, "AI" | "HUMAN" | "SYSTEM">;
  sentById?: string;
  sentByName?: string;
  batchId?: string;
  ai?: { model: string; inputTokens: number; outputTokens: number; costUsd: number };
}) {
  const conv = await prisma.dmConversation.findUniqueOrThrow({ where: { id: input.conversationId }, include: { contact: true } });
  if (!windowOpen(conv.lastUserMessageAt, new Date())) throw new WindowClosedError();
  const sender = getChannelSender();
  const row = await prisma.dmMessage.create({
    data: {
      conversationId: conv.id, clientId: conv.clientId, direction: "OUT", sender: input.sender, status: "PENDING",
      text: input.text ?? null,
      media: input.imageUrl ? ([{ type: "image", url: input.imageUrl }] as Prisma.InputJsonValue) : undefined,
      batchId: input.batchId, sentById: input.sentById, sentByName: input.sentByName,
      ...(input.ai ? { model: input.ai.model, inputTokens: input.ai.inputTokens, outputTokens: input.ai.outputTokens, costUsd: input.ai.costUsd } : {}),
    },
  });
  try {
    const res = await sender.send({
      channel: conv.channel, accountId: conv.contact.accountId, recipientId: conv.contact.externalId,
      message: { text: input.text, imageUrl: input.imageUrl },
    });
    const sent = await prisma.dmMessage.update({ where: { id: row.id }, data: { status: "SENT", externalId: res.externalId } });
    await prisma.dmConversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    await publishDmEvent({ clientId: conv.clientId, conversationId: conv.id, kind: "message" });
    return sent;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.dmMessage.update({ where: { id: row.id }, data: { status: "FAILED", error: msg.slice(0, 500) } });
    await publishDmEvent({ clientId: conv.clientId, conversationId: conv.id, kind: "message" });
    if (e instanceof MetaDmError && e.windowClosed) throw new WindowClosedError();
    throw e;
  }
}

/** "Yazıyor" işareti (hata vermez). */
export async function typingOn(conversationId: string) {
  try {
    const conv = await prisma.dmConversation.findUnique({ where: { id: conversationId }, include: { contact: true } });
    if (!conv) return;
    await getChannelSender().senderAction({ channel: conv.channel, accountId: conv.contact.accountId, recipientId: conv.contact.externalId, action: "typing_on" });
  } catch {
    // yoksay
  }
}
