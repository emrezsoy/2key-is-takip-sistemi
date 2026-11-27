// Takip mesajı zamanlaması (saf fonksiyon; testleri: followupMath.test.ts). 24 saat penceresi kesindir.
// Hedef: kişinin son mesajından sonraki gün sabah aralığı (10:00-12:00). Pencere o saatten önce kapanıyorsa aynı gün
// akşam aralığı (17:00-20:00). Gece (22:00-09:00) gönderim yok. Pencere kapanmasına 30 dk'dan az kalacaksa gönderilmez.
import { addDays, localDay, localToDate } from "./availability";

export type FollowUpCfg = {
  morningStart: string; morningEnd: string; eveningStart: string; eveningEnd: string; quietStart: string; quietEnd: string;
};

const MIN = 60_000;

function inQuiet(d: Date, cfg: FollowUpCfg) {
  const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(d);
  return cfg.quietStart > cfg.quietEnd ? hm >= cfg.quietStart || hm < cfg.quietEnd : hm >= cfg.quietStart && hm < cfg.quietEnd;
}

/** [a, b] aralığında, pencere sınırını aşmayan rastgele bir an; aralık geçersizse null. */
function pick(a: Date, b: Date, now: Date, limit: Date, rand: number): Date | null {
  const start = Math.max(a.getTime(), now.getTime());
  const end = Math.min(b.getTime(), limit.getTime());
  if (end <= start) return null;
  return new Date(start + Math.floor((end - start) * rand / MIN) * MIN);
}

export function followUpTime(input: { lastUserMessageAt: Date; now: Date; cfg: FollowUpCfg; rand?: number; safetyMin?: number }): { at: Date } | { skip: true } {
  const { cfg, now } = input;
  const rand = input.rand ?? Math.random();
  const limit = new Date(input.lastUserMessageAt.getTime() + 24 * 60 * MIN - (input.safetyMin ?? 30) * MIN);
  if (limit <= now) return { skip: true };
  const day = localDay(input.lastUserMessageAt).date;
  const next = addDays(day, 1);
  const candidates: [Date, Date][] = [
    [localToDate(next, cfg.morningStart), localToDate(next, cfg.morningEnd)],
    [localToDate(day, cfg.eveningStart), localToDate(day, cfg.eveningEnd)],
  ];
  for (const [a, b] of candidates) {
    const at = pick(a, b, now, limit, rand);
    if (at && !inQuiet(at, cfg)) return { at };
  }
  return { skip: true };
}
