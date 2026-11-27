// Randevu uygunluğu (saf fonksiyonlar; testleri: availability.test.ts). Uygunluğu kod hesaplar, AI yalnızca sorar.
// Türkiye saati sabit UTC+3 (yaz saati yok).

export const TR_OFFSET = "+03:00";

/** "YYYY-MM-DD" + "HH:MM" (İstanbul) → Date. */
export const localToDate = (date: string, hm: string) => new Date(`${date}T${hm}:00${TR_OFFSET}`);

/** Date → İstanbul "YYYY-MM-DD" ve haftanın günü (1 = Pazartesi). */
export function localDay(d: Date) {
  const shifted = new Date(d.getTime() + 3 * 3600_000);
  const date = shifted.toISOString().slice(0, 10);
  const wd = shifted.getUTCDay();
  return { date, weekday: wd === 0 ? 7 : wd };
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type WeeklyRule = { weekday: number; startTime: string; endTime: string };
export type Interval = { start: Date; end: Date };

export function computeSlots(input: {
  fromDate: string;
  days: number;
  weekly: WeeklyRule[];
  closed: Interval[];
  busy: Interval[];
  durationMin: number;
  gapMin: number;
  now: Date;
  /** Şu andan en az kaç dakika sonrası önerilir. */
  leadMin?: number;
  maxSlots?: number;
}): Date[] {
  const dur = input.durationMin * 60_000;
  const gap = input.gapMin * 60_000;
  const earliest = input.now.getTime() + (input.leadMin ?? 60) * 60_000;
  const out: Date[] = [];
  const overlaps = (s: number, e: number, list: Interval[], pad = 0) =>
    list.some((iv) => s < iv.end.getTime() + pad && e + pad > iv.start.getTime());
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromDate, i);
    const weekday = localDay(localToDate(date, "12:00")).weekday;
    for (const r of input.weekly.filter((w) => w.weekday === weekday)) {
      const open = localToDate(date, r.startTime).getTime();
      const close = localToDate(date, r.endTime).getTime();
      for (let s = open; s + dur <= close; s += dur + gap) {
        const e = s + dur;
        if (s < earliest) continue;
        if (overlaps(s, e, input.closed)) continue;
        if (overlaps(s, e, input.busy, gap)) continue;
        out.push(new Date(s));
        if (input.maxSlots && out.length >= input.maxSlots) return out;
      }
    }
  }
  return out;
}

/** Bir zamanın uygun olup olmadığı (talep oluştururken doğrulama). */
/** Talep edilen saat çalışma aralığının içinde mi ve boş mu (öneri ızgarasına denk gelmesi gerekmez; ör. 15:15 de olur). */
export function isSlotFree(start: Date, input: Omit<Parameters<typeof computeSlots>[0], "fromDate" | "days" | "maxSlots">): boolean {
  const s = start.getTime();
  const e = s + input.durationMin * 60_000;
  const gap = input.gapMin * 60_000;
  if (s < input.now.getTime() + (input.leadMin ?? 60) * 60_000) return false;
  const { date, weekday } = localDay(start);
  const inWindow = input.weekly
    .filter((w) => w.weekday === weekday)
    .some((r) => s >= localToDate(date, r.startTime).getTime() && e <= localToDate(date, r.endTime).getTime());
  if (!inWindow) return false;
  const overlaps = (list: Interval[], pad = 0) => list.some((iv) => s < iv.end.getTime() + pad && e + pad > iv.start.getTime());
  return !overlaps(input.closed) && !overlaps(input.busy, gap);
}

export const fmtTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(d);
