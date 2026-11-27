// Gelen kanal olaylarını kaydeder: kişi / konuşma / mesaj; echo (işletme sahibi uygulamadan yazdı) → konuşma insana geçer;
// AI cevap verebilecekse toplama süresine göre PROCESS_BATCH işi planlanır, medya için analiz hemen başlar.
import type { DmChannel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DmAttachment, DmInboundEvent } from "./channels/types";
import { aiGate, batchRunAt } from "./batching";
import { getBalance } from "./credits";
import { canReply } from "./creditMath";
import { enqueue } from "./queue";
import { publishDmEvent } from "./events";
import { mediaKeysForMessage } from "./mediaKeys";
import { getDmApp, metaContactProfile } from "./metaDm";
import { isFakeChannel } from "./channels";

const MEDIA_TYPES = new Set(["image", "video", "reel", "post", "share", "story_mention"]);

/** Hesap id'sinden (sayfa / IG hesabı) müşteriyi bulur. */
export async function clientForAccount(channel: DmChannel, accountId: string) {
  const acc = await prisma.socialAccount.findFirst({
    where: channel === "FACEBOOK" ? { pageId: accountId } : { igId: accountId },
    select: { clientId: true },
  });
  if (!acc?.clientId) return null;
  return prisma.client.findUnique({
    where: { id: acc.clientId },
    select: { id: true, name: true, dmManaged: true, dmPaused: true, dmModuleMedia: true },
  });
}

async function upsertConversation(clientId: string, ev: DmInboundEvent) {
  const contact = await prisma.dmContact.upsert({
    where: { channel_accountId_externalId: { channel: ev.channel, accountId: ev.accountId, externalId: ev.contactId } },
    update: {},
    create: { clientId, channel: ev.channel, accountId: ev.accountId, externalId: ev.contactId },
  });
  const conversation = await prisma.dmConversation.upsert({
    where: { contactId: contact.id },
    update: {},
    create: { clientId, contactId: contact.id, channel: ev.channel },
  });
  return { contact, conversation };
}

const mediaJson = (atts: DmAttachment[]) => (atts.length ? (atts as unknown as Prisma.InputJsonValue) : undefined);

export async function ingestEvents(events: DmInboundEvent[]) {
  for (const ev of events) {
    try {
      await ingestOne(ev);
    } catch (e) {
      console.error("DM olayı işlenemedi:", ev.kind, e instanceof Error ? e.message : e);
      throw e;
    }
  }
}

async function ingestOne(ev: DmInboundEvent) {
  if (ev.kind === "read" || ev.kind === "reaction") return;
  const client = await clientForAccount(ev.channel, ev.accountId);
  if (!client) return; // bağlı müşteri yok: kaydedilmez
  const now = new Date();

  if (ev.kind === "echo") {
    if (ev.mid && (await prisma.dmMessage.findUnique({ where: { externalId: ev.mid } }))) return; // kendi gönderdiğimiz
    // Kendi gönderdiğimiz mesajın yankısı, gönderim kaydından önce gelmiş olabilir: birkaç saniye sonra tekrar bakılır.
    await enqueue("ECHO_CHECK", { event: JSON.parse(JSON.stringify(ev)) as Prisma.InputJsonValue }, { runAt: new Date(Date.now() + 6000) });
    return;
  }

  const { contact, conversation } = await upsertConversation(client.id, ev);
  if (!contact.name && !contact.username && !isFakeChannel()) {
    await enqueue("FETCH_PROFILE", { contactId: contact.id }, { dedupeKey: `profile:${contact.id}`, maxAttempts: 2 });
  }

  if (ev.kind === "referral") {
    await prisma.dmMessage.create({
      data: {
        conversationId: conversation.id, clientId: client.id, direction: "IN", sender: "SYSTEM",
        text: null, referral: ev.referral as Prisma.InputJsonValue, createdAt: ev.timestamp,
      },
    });
    await publishDmEvent({ clientId: client.id, conversationId: conversation.id, kind: "message" });
    return;
  }

  // Gelen mesaj
  if (ev.mid && (await prisma.dmMessage.findUnique({ where: { externalId: ev.mid } }))) return; // Meta aynı olayı tekrar yolladı
  if (ev.isDeleted) {
    if (ev.mid) await prisma.dmMessage.updateMany({ where: { externalId: ev.mid }, data: { text: "(kişi bu mesajı sildi)", media: undefined } });
    return;
  }
  let message;
  try {
    message = await prisma.dmMessage.create({
      data: {
        conversationId: conversation.id, clientId: client.id, direction: "IN", sender: "CONTACT",
        text: ev.text ?? (ev.isUnsupported ? "(desteklenmeyen içerik)" : null),
        media: mediaJson(ev.attachments), externalId: ev.mid, referral: ev.referral as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") return; // eşzamanlı tekrar
    throw e;
  }

  const isMedia = ev.attachments.some((a) => MEDIA_TYPES.has(a.type)) || !!ev.referral?.videoUrl || !!ev.referral?.photoUrl;
  const config = await prisma.dmConfig.upsert({ where: { clientId: client.id }, update: {}, create: { clientId: client.id } });
  const balance = await getBalance(client.id);
  const gate = aiGate({
    dmManaged: client.dmManaged, dmPaused: client.dmPaused, mode: conversation.mode, aiBlocked: contact.aiBlocked,
    canReply: canReply(balance), lastUserMessageAt: now, now,
  });

  const pendingSince = conversation.pendingSince ?? now;
  await prisma.dmConversation.update({
    where: { id: conversation.id },
    data: {
      lastUserMessageAt: now, lastMessageAt: now, unreadCount: { increment: 1 },
      pendingSince: gate ? null : pendingSince,
      ...(gate === "NO_CREDIT" ? { waitingHuman: true, missedWhilePaused: true } : {}),
      ...(gate === "CLIENT_PAUSED" ? { missedWhilePaused: true } : {}),
      // Kullanıcı yeni mesaj atınca sınıflandırma yeniden yapılır (takip mesajı kararı).
      classification: "UNKNOWN", classifiedAt: null,
    },
  });
  if (gate === "NO_CREDIT" && !config.stoppedAt) {
    await prisma.dmConfig.update({ where: { clientId: client.id }, data: { stoppedAt: now } });
  }

  if (!gate) {
    // Medya analizi bekleme süresi devam ederken başlar (sonuç önbelleğe yazılır).
    if (client.dmModuleMedia) {
      for (const key of mediaKeysForMessage(ev.attachments, ev.referral)) {
        await enqueue("ANALYZE_MEDIA", { clientId: client.id, messageId: message.id, ...key }, { dedupeKey: `media:${key.key}` });
      }
    }
    await enqueue(
      "PROCESS_BATCH",
      { conversationId: conversation.id },
      {
        dedupeKey: `batch:${conversation.id}`,
        runAt: batchRunAt({ now, pendingSince, lastIsMedia: isMedia, waitTextSec: config.waitTextSec, waitMediaSec: config.waitMediaSec, waitMaxSec: config.waitMaxSec }),
      }
    );
  }
  await publishDmEvent({ clientId: client.id, conversationId: conversation.id, kind: "message" });
}

/** FETCH_PROFILE: yeni kişinin adı / kullanıcı adı Meta'dan alınır (gelen kutusunda "Kişi 1234" yerine isim görünür). */
export async function fetchContactProfile(contactId: string) {
  const contact = await prisma.dmContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.name || contact.username) return;
  const p = await metaContactProfile({ channel: contact.channel, accountId: contact.accountId, contactId: contact.externalId });
  if (!p.name && !p.username) return;
  await prisma.dmContact.update({ where: { id: contactId }, data: { name: p.name, username: p.username, profilePic: p.profilePic } });
  const conv = await prisma.dmConversation.findUnique({ where: { contactId }, select: { id: true } });
  await publishDmEvent({ clientId: contact.clientId, conversationId: conv?.id, kind: "conversation" });
}

/** ECHO_CHECK: yankı hâlâ bizim gönderdiğimiz bir mesajla eşleşmiyorsa işletme sahibi uygulamadan yazmıştır:
 * insan mesajı olarak kaydedilir ve konuşma insana geçer (AI karışmaz). */
export async function handleEchoCheck(ev: DmInboundEvent) {
  if (ev.mid && (await prisma.dmMessage.findUnique({ where: { externalId: ev.mid } }))) return;
  const ownApp = (await getDmApp()).appId;
  if (ev.appId && ownApp && ev.appId === ownApp) return; // bizim uygulamamızın gönderdiği (kayıt eşleşmese de)
  const client = await clientForAccount(ev.channel, ev.accountId);
  if (!client) return;
  const { conversation } = await upsertConversation(client.id, ev);
  try {
    await prisma.dmMessage.create({
      data: {
        conversationId: conversation.id, clientId: client.id, direction: "OUT", sender: "HUMAN", isEcho: true,
        text: ev.text ?? null, media: mediaJson(ev.attachments), externalId: ev.mid, sentByName: "İşletme (uygulamadan)",
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") return;
    throw e;
  }
  await prisma.dmConversation.update({
    where: { id: conversation.id },
    data: { mode: "HUMAN", lastMessageAt: new Date(), pendingSince: null, waitingHuman: false, unreadCount: 0, handoffReason: "İşletme sahibi uygulamadan cevap verdi" },
  });
  // Bekleyen cevap işi iptal edilir.
  await prisma.dmJob.deleteMany({ where: { dedupeKey: `batch:${conversation.id}`, status: "PENDING" } });
  await publishDmEvent({ clientId: client.id, conversationId: conversation.id, kind: "conversation" });
}
