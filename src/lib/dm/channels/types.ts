// Kanal bağımsız mesaj olayları. Her kanal (Instagram, Facebook; ileride WEB, WHATSAPP) kendi verisini bu biçime çevirir.
import type { DmChannel } from "@prisma/client";

export type DmAttachmentType = "image" | "video" | "audio" | "file" | "share" | "story_mention" | "reel" | "post" | "sticker" | "other";

export type DmAttachment = { type: DmAttachmentType; url?: string; title?: string; id?: string };

/** Reklam / kısa bağlantı / story yanıtı referansı. */
export type DmReferral = {
  source?: string; // ADS | SHORTLINK | IGME-SOURCE-LINK
  type?: string;
  ref?: string;
  adId?: string;
  adTitle?: string;
  photoUrl?: string;
  videoUrl?: string;
  postId?: string;
  storyId?: string;
  storyUrl?: string;
};

export type DmInboundEvent = {
  kind: "message" | "echo" | "read" | "reaction" | "referral";
  channel: DmChannel;
  /** İşletme hesabı: Facebook sayfa id'si ya da Instagram hesap id'si. */
  accountId: string;
  /** Karşı taraf (müşteri) kimliği: IGSID / PSID. */
  contactId: string;
  mid?: string;
  text?: string;
  attachments: DmAttachment[];
  referral?: DmReferral;
  timestamp: Date;
  isDeleted?: boolean;
  isUnsupported?: boolean;
  /** Echo'yu gönderen uygulama (Messenger). */
  appId?: string;
};

export type DmOutbound = { text?: string; imageUrl?: string };

export type DmSendResult = { externalId: string | null };

export interface DmChannelSender {
  send(input: { channel: DmChannel; accountId: string; recipientId: string; message: DmOutbound }): Promise<DmSendResult>;
  /** "Görüldü" / "yazıyor" işareti (desteklenmiyorsa sessizce geçer). */
  senderAction(input: { channel: DmChannel; accountId: string; recipientId: string; action: "typing_on" | "typing_off" | "mark_seen" }): Promise<void>;
}
