// Meta webhook gövdesini (Instagram: object "instagram", Facebook sayfası: object "page") ortak olaylara çevirir.
// Saf fonksiyonlar; testleri: metaParse.test.ts. Kaynak: Meta geliştirici belgeleri (Messenger Platform / Instagram), Kasım 2026.
import crypto from "node:crypto";
import type { DmAttachment, DmAttachmentType, DmInboundEvent, DmReferral } from "./types";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

/** X-Hub-Signature-256 doğrulaması: ham gövdenin uygulama gizli anahtarıyla HMAC-SHA256'sı ("sha256=<hex>"). */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const signMetaBody = (rawBody: string, appSecret: string) =>
  `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

const ATTACHMENT_TYPES: Record<string, DmAttachmentType> = {
  image: "image", video: "video", audio: "audio", file: "file", share: "share", story_mention: "story_mention",
  reel: "reel", ig_reel: "reel", post: "post", ig_post: "post", sticker: "sticker",
};

function parseReferral(r: Json): DmReferral | undefined {
  if (!Object.keys(r).length) return undefined;
  const ctx = obj(r.ads_context_data);
  return {
    source: str(r.source), type: str(r.type), ref: str(r.ref), adId: str(r.ad_id),
    adTitle: str(ctx.ad_title), photoUrl: str(ctx.photo_url), videoUrl: str(ctx.video_url), postId: str(ctx.post_id),
  };
}

export function parseMetaWebhook(body: unknown): DmInboundEvent[] {
  const root = obj(body);
  const channel = root.object === "instagram" ? "INSTAGRAM" : root.object === "page" ? "FACEBOOK" : null;
  if (!channel) return [];
  const out: DmInboundEvent[] = [];
  for (const entryRaw of Array.isArray(root.entry) ? root.entry : []) {
    const entry = obj(entryRaw);
    const accountId = str(entry.id);
    if (!accountId) continue;
    for (const evRaw of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const ev = obj(evRaw);
      const sender = str(obj(ev.sender).id);
      const recipient = str(obj(ev.recipient).id);
      const timestamp = new Date(Number(ev.timestamp) || Date.now());
      const message = obj(ev.message);
      if (Object.keys(message).length) {
        const isEcho = message.is_echo === true;
        // Echo'da gönderen işletmenin kendisidir; karşı taraf alıcıdır.
        const contactId = isEcho ? recipient : sender;
        if (!contactId) continue;
        const attachments: DmAttachment[] = (Array.isArray(message.attachments) ? message.attachments : []).map((a) => {
          const at = obj(a);
          const payload = obj(at.payload);
          return { type: ATTACHMENT_TYPES[String(at.type)] ?? "other", url: str(payload.url), title: str(payload.title), id: str(payload.id) };
        });
        const replyTo = obj(message.reply_to);
        const story = obj(replyTo.story);
        let referral = parseReferral(obj(message.referral));
        if (story.id || story.url) referral = { ...(referral ?? {}), storyId: str(story.id), storyUrl: str(story.url) };
        out.push({
          kind: isEcho ? "echo" : "message",
          channel, accountId, contactId, timestamp,
          mid: str(message.mid),
          text: str(message.text),
          attachments,
          referral,
          isDeleted: message.is_deleted === true,
          isUnsupported: message.is_unsupported === true,
          appId: str(message.app_id),
        });
        continue;
      }
      if (ev.referral && sender) {
        out.push({ kind: "referral", channel, accountId, contactId: sender, timestamp, attachments: [], referral: parseReferral(obj(ev.referral)) });
        continue;
      }
      if ((ev.read || ev.reaction) && sender) {
        out.push({ kind: ev.read ? "read" : "reaction", channel, accountId, contactId: sender, timestamp, attachments: [] });
      }
    }
  }
  return out;
}
