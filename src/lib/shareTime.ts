import type { ShareKind } from "@prisma/client";

/** Paylaşım saati "HH:MM" (24 saat, Türkiye saati). */
export const SHARE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SHARE_KIND_LABEL: Record<ShareKind, string> = { POST: "Post", STORY: "Story", REEL: "Reels" };

export function parseShareTime(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!SHARE_TIME_RE.test(v)) throw new Error("Saat SS:DD biçiminde olmalı (ör. 19:30).");
  return v;
}

export function parseShareKind(raw: unknown): ShareKind {
  const v = String(raw ?? "");
  return v === "STORY" ? "STORY" : v === "REEL" ? "REEL" : "POST";
}

/** Türkiye saati (UTC+3, yaz saati yok) "YYYY-MM-DD" + "HH:MM" -> gerçek an. */
export function istanbulInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
}

/** Bir günün paylaşımları arasında sıralama: saati olanlar saat sırasıyla, saatsizler sonda. */
export const compareShareTime = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);
