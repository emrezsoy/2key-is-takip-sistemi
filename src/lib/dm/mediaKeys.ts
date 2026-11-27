// Medya analizi önbellek anahtarları: aynı reklam / post bir kez analiz edilir, tüm sohbetlerde tekrar kullanılır.
import crypto from "node:crypto";
import type { DmAttachment, DmReferral } from "./channels/types";

export type MediaKey = { key: string; kind: "IMAGE" | "VIDEO" | "AD" | "POST" | "STORY"; url?: string; title?: string };

const urlHash = (url: string) => crypto.createHash("sha256").update(url.split("?")[0]).digest("hex").slice(0, 40);

export function mediaKeysForMessage(attachments: DmAttachment[], referral?: DmReferral): MediaKey[] {
  const keys: MediaKey[] = [];
  if (referral?.adId) {
    keys.push({ key: `ad:${referral.adId}`, kind: "AD", url: referral.videoUrl ?? referral.photoUrl, title: referral.adTitle });
  } else if (referral?.postId) {
    keys.push({ key: `post:${referral.postId}`, kind: "POST", url: referral.videoUrl ?? referral.photoUrl });
  }
  if (referral?.storyId) keys.push({ key: `story:${referral.storyId}`, kind: "STORY", url: referral.storyUrl });
  for (const a of attachments) {
    if (!a.url && !a.id) continue;
    if (a.type === "image" || a.type === "sticker") keys.push({ key: `sha:${urlHash(a.url!)}`, kind: "IMAGE", url: a.url });
    else if (a.type === "video") keys.push({ key: `sha:${urlHash(a.url!)}`, kind: "VIDEO", url: a.url });
    else if (a.type === "reel" || a.type === "post" || a.type === "share" || a.type === "story_mention") {
      keys.push({ key: a.id ? `post:${a.id}` : `sha:${urlHash(a.url!)}`, kind: a.type === "story_mention" ? "STORY" : "POST", url: a.url, title: a.title });
    }
  }
  return keys;
}
