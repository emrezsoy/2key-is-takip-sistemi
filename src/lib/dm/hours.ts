// Mesai saatleri (DmConfig.businessHours): { "1": [["09:00","18:00"]], ... } (1 = Pazartesi ... 7 = Pazar).
export type BusinessHours = Record<string, [string, string][]>;

export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/** Verilen saat diliminde haftanın günü (1-7) ve "HH:MM". */
export function localParts(now: Date, tz = "Europe/Istanbul") {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const hm = `${get("hour").replace("24", "00")}:${get("minute")}`;
  return { weekday, hm, date: `${get("year")}-${get("month")}-${get("day")}` };
}

export function isOpenAt(hours: BusinessHours | null | undefined, now: Date, tz = "Europe/Istanbul"): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const { weekday, hm } = localParts(now, tz);
  return (hours[String(weekday)] ?? []).some(([a, b]) => hm >= a && hm < b);
}

/** Bir sonraki açılış ("Yarın 09:00", "Pazartesi 10:00"); hiç açık gün yoksa null. */
export function nextOpening(hours: BusinessHours | null | undefined, now: Date, tz = "Europe/Istanbul"): string | null {
  if (!hours || Object.keys(hours).length === 0) return null;
  const { weekday, hm } = localParts(now, tz);
  for (let i = 0; i < 8; i++) {
    const d = ((weekday - 1 + i) % 7) + 1;
    const slots = [...(hours[String(d)] ?? [])].sort((x, y) => x[0].localeCompare(y[0]));
    const slot = slots.find(([a]) => i > 0 || a > hm);
    if (slot) return `${i === 0 ? "Bugün" : i === 1 ? "Yarın" : WEEKDAYS[d - 1]} ${slot[0]}`;
  }
  return null;
}

export function describeHours(hours: BusinessHours | null | undefined): string {
  if (!hours || Object.keys(hours).length === 0) return "Belirtilmemiş";
  return WEEKDAYS.map((name, i) => {
    const slots = hours[String(i + 1)] ?? [];
    return `${name}: ${slots.length ? slots.map(([a, b]) => `${a}-${b}`).join(", ") : "kapalı"}`;
  }).join("; ");
}
