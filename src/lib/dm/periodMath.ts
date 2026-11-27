// Mesaj Otomasyonu abonelik dönemi hesapları (saf fonksiyonlar; testleri: periodMath.test.ts).
// Otomatik yenileme yoktur: admin ödeme alınca "paket + ay sayısı" girer. Dönem boyunca her ay, dönem başlangıç
// gününde plan kredisi yüklenir; önceki ayın kullanılmayan plan kredisi silinir. Dönem bitince ek süre (grace) başlar.

const DAY = 24 * 60 * 60 * 1000;

/** Tarihe ay ekler (ayın günü hedef ayda yoksa ayın son günü). Saat bilgisi korunur. */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

export type PeriodLike = { id: string; startDate: Date; months: number; paidThrough: Date; cancelledAt?: Date | null; monthlyCredits: number };

/** Dönemin kaçıncı ayındayız (0'dan başlar); dönem başlamadıysa ya da bittiyse null. */
export function monthIndexAt(p: PeriodLike, now: Date): number | null {
  if (p.cancelledAt || now < p.startDate || now >= p.paidThrough) return null;
  let n = 0;
  while (n + 1 < p.months && addMonths(p.startDate, n + 1) <= now) n++;
  return n;
}

export type SubscriptionStatus =
  /** Ödenmiş dönem içinde. */
  | "ACTIVE"
  /** Dönem bitti, ek süre içinde (ödeme bekleniyor). */
  | "GRACE"
  /** Ek süre de bitti: plan kredisi yenilenmez (kalıcı kredi varsa o kullanılır). */
  | "EXPIRED"
  /** Hiç dönem girilmemiş. */
  | "NONE";

export function subscriptionStatus(periods: PeriodLike[], now: Date, graceDays: number) {
  const live = periods.filter((p) => !p.cancelledAt);
  if (live.length === 0) return { status: "NONE" as SubscriptionStatus, active: null, paidThrough: null, graceEndsAt: null };
  const active = live.find((p) => monthIndexAt(p, now) !== null) ?? null;
  const paidThrough = new Date(Math.max(...live.map((p) => p.paidThrough.getTime())));
  const graceEndsAt = new Date(paidThrough.getTime() + graceDays * DAY);
  let status: SubscriptionStatus;
  if (active) status = "ACTIVE";
  else if (now < paidThrough) status = "ACTIVE"; // gelecekte başlayacak dönem girilmiş, araya boşluk düşmüş: bekleme
  else if (now < graceEndsAt) status = "GRACE";
  else status = "EXPIRED";
  return { status, active, paidThrough, graceEndsAt };
}

/** Yeni ödeme girilirken dönemin başlangıcı: mevcut dönem sürüyorsa ya da ek süredeyse kaldığı yerden devam eder
 * (araya boşluk düşmez), ek süre de geçtiyse bugünden başlar. */
export function nextPeriodStart(periods: PeriodLike[], now: Date, graceDays: number): Date {
  const live = periods.filter((p) => !p.cancelledAt);
  if (live.length === 0) return now;
  const paidThrough = new Date(Math.max(...live.map((p) => p.paidThrough.getTime())));
  return now.getTime() < paidThrough.getTime() + graceDays * DAY ? paidThrough : now;
}

/** Yenileme bildirimi zamanı geldi mi (dönem bitimine noticeDays kala, dönem bitmeden). */
export function renewalDue(paidThrough: Date | null, now: Date, noticeDays: number): boolean {
  if (!paidThrough) return false;
  return now.getTime() >= paidThrough.getTime() - noticeDays * DAY && now < paidThrough;
}
