// Bekleme / toplama (debounce) ve AI'ın cevap verip vermeyeceği kararı (saf fonksiyonlar; testleri: batching.test.ts).

/** Son mesaj metinse waitText, medyaysa waitMedia saniye beklenir; her yeni mesaj süreyi sıfırlar.
 * İlk bekleyen mesajdan itibaren toplam bekleme waitMax'ı geçmez. */
export function batchRunAt(input: { now: Date; pendingSince: Date | null; lastIsMedia: boolean; waitTextSec: number; waitMediaSec: number; waitMaxSec: number }): Date {
  const wait = (input.lastIsMedia ? input.waitMediaSec : input.waitTextSec) * 1000;
  const start = input.pendingSince ?? input.now;
  const cap = start.getTime() + input.waitMaxSec * 1000;
  return new Date(Math.max(input.now.getTime(), Math.min(input.now.getTime() + wait, cap)));
}

export type AiGateReason =
  | "SERVICE_OFF"
  | "CLIENT_PAUSED"
  | "HUMAN_MODE"
  | "CONTACT_BLOCKED"
  | "NO_CREDIT"
  | "WINDOW_CLOSED";

export const AI_GATE_LABEL: Record<AiGateReason, string> = {
  SERVICE_OFF: "Hizmet kapalı",
  CLIENT_PAUSED: "AI kapalı (işletme durdurdu)",
  HUMAN_MODE: "Konuşma insanda",
  CONTACT_BLOCKED: "Bu kişiye AI cevap vermiyor",
  NO_CREDIT: "Kredi bitti",
  WINDOW_CLOSED: "24 saat penceresi kapandı",
};

/** AI bu konuşmaya cevap verebilir mi? null = evet. */
export function aiGate(input: {
  dmManaged: boolean;
  dmPaused: boolean;
  mode: "AI" | "HUMAN";
  aiBlocked: boolean;
  canReply: boolean;
  lastUserMessageAt: Date | null;
  now: Date;
}): AiGateReason | null {
  if (!input.dmManaged) return "SERVICE_OFF";
  if (input.dmPaused) return "CLIENT_PAUSED";
  if (input.mode === "HUMAN") return "HUMAN_MODE";
  if (input.aiBlocked) return "CONTACT_BLOCKED";
  if (!input.canReply) return "NO_CREDIT";
  if (!windowOpen(input.lastUserMessageAt, input.now)) return "WINDOW_CLOSED";
  return null;
}

const HOUR = 3600_000;

/** 24 saat penceresi açık mı (en az safetyMin dakika pay bırakarak). */
export function windowOpen(lastUserMessageAt: Date | null, now: Date, safetyMin = 30): boolean {
  if (!lastUserMessageAt) return false;
  return now.getTime() < lastUserMessageAt.getTime() + 24 * HOUR - safetyMin * 60_000;
}

export const windowEndsAt = (lastUserMessageAt: Date) => new Date(lastUserMessageAt.getTime() + 24 * HOUR);
