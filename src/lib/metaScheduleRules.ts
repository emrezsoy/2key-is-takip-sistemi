import { istanbulInstant } from "@/lib/shareTime";

/** Instagram açıklama (caption) sınırı. */
export const META_CAPTION_MAX = 2200;
/** Planlama en az bu kadar ileri bir saate yapılabilir. */
export const META_MIN_LEAD_MS = 2 * 60 * 1000;

export type MetaRuleInput = {
  kind: "POST" | "STORY" | "REEL";
  date: string;
  time: string | null;
  text: string | null;
  images: { mediaType: "IMAGE" | "VIDEO" }[];
  /** Müşterinin Meta hesabına erişimimiz: bağlı ve paylaşım yetkisi var / hesap bağlı değil / bağlı ama paylaşım yetkisi yok. */
  metaAccess: MetaAccess;
};

export type MetaAccess = "OK" | "NO_ACCOUNT" | "NO_PERMISSION";

/** Bağlantı / yetki yoksa gösterilecek uyarı (planlama kapalı; paylaşım elle yapılır). */
export function metaAccessWarning(access: MetaAccess): string | null {
  if (access === "NO_ACCOUNT") return "Bu müşterinin Meta hesabı (Facebook sayfası / Instagram) sistemimize bağlı değil. Otomatik planlanamaz; paylaşımı elle yapmalısın.";
  if (access === "NO_PERMISSION") return "Bu müşterinin Meta hesabında paylaşım yetkimiz yok (sadece istatistik görebiliyoruz). Otomatik planlanamaz; paylaşımı elle yapmalısın.";
  return null;
}

/** "Meta'da planla" için eksikler (boş liste = planlanabilir). Hem ekranda hem sunucuda aynı kurallar kullanılır. */
export function metaScheduleProblems(p: MetaRuleInput, now: number = Date.now()): string[] {
  const out: string[] = [];
  const access = metaAccessWarning(p.metaAccess);
  if (access) return [access];
  if (!p.time) out.push("Paylaşım saati girilmemiş.");
  else if (istanbulInstant(p.date, p.time).getTime() < now + META_MIN_LEAD_MS) out.push("Paylaşım saati geçmiş ya da çok yakın.");
  if (p.kind !== "STORY" && !p.text?.trim()) out.push("Paylaşım metni (caption) yazılmamış.");
  if ((p.text?.length ?? 0) > META_CAPTION_MAX) out.push(`Paylaşım metni ${META_CAPTION_MAX} karakteri aşıyor.`);
  if (p.images.length === 0) out.push("Görsel ya da video eklenmemiş.");
  if (p.kind === "REEL" && (p.images.length !== 1 || p.images[0].mediaType !== "VIDEO")) {
    out.push("Reels için tek bir video olmalı.");
  }
  return out;
}
