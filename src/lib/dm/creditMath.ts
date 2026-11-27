// Mesaj Otomasyonu kredi kuralları (saf fonksiyonlar; veritabanına dokunmaz, testleri: creditMath.test.ts).
//
// - Bakiye iki kovadan oluşur: PLAN (aylık paket kredisi, ay sonunda silinir) ve PERMANENT (kalıcı, silinmez).
// - Cevap ancak toplam bakiye > 0 iken üretilir.
// - Harcama önce PLAN'dan, o bitince PERMANENT'tan yapılır.
// - Bir cevabın bedeli bakiyeyi en fazla -negativeLimit'e düşürebilir; fazlası alınmaz.
// - Eksiye düşen kısım (borç), paket aktifse PLAN kovasına yazılır (bir sonraki aylık yüklemeden düşer),
//   değilse PERMANENT kovasına (bir sonraki kalıcı yüklemeden düşer).

export type Balance = { plan: number; permanent: number };

export const totalOf = (b: Balance) => b.plan + b.permanent;

/** Yeni bir cevap üretilebilir mi? */
export const canReply = (b: Balance) => totalOf(b) > 0;

export type ChargeSplit = {
  /** Gerçekte düşülen toplam (eksi limit nedeniyle bedelden az olabilir). */
  charged: number;
  fromPlan: number;
  fromPermanent: number;
};

export function splitCharge(b: Balance, cost: number, negativeLimit: number, planActive: boolean): ChargeSplit | null {
  if (!Number.isInteger(cost) || cost < 0) throw new Error("Geçersiz kredi bedeli.");
  if (!canReply(b)) return null;
  if (cost === 0) return { charged: 0, fromPlan: 0, fromPermanent: 0 };
  const limit = Math.max(0, negativeLimit);
  const charged = Math.min(cost, totalOf(b) + limit);
  let fromPlan = Math.min(Math.max(b.plan, 0), charged);
  let fromPermanent = Math.min(Math.max(b.permanent, 0), charged - fromPlan);
  const overdraft = charged - fromPlan - fromPermanent;
  if (overdraft > 0) {
    if (planActive) fromPlan += overdraft;
    else fromPermanent += overdraft;
  }
  return { charged, fromPlan, fromPermanent };
}

/** Bir tur (toplanıp tek cevapla yanıtlanan mesaj grubu) için içerik türü. */
export type TurnContent = "TEXT" | "IMAGE" | "VIDEO" | "CACHED_MEDIA";

export type Costs = { textCost: number; imageCost: number; videoCost: number; cachedMediaCost: number };

/** Tur bedeli: gruptaki en "pahalı" yeni içeriğe göre. Daha önce analiz edilmiş reklam/post cachedMediaCost'tur.
 * Sohbet geçmişindeki eski medya bedeli artırmaz (buraya sadece bu turun içeriği verilir). */
export function turnCost(contents: TurnContent[], c: Costs): number {
  const price = (t: TurnContent) =>
    t === "VIDEO" ? c.videoCost : t === "IMAGE" ? c.imageCost : t === "CACHED_MEDIA" ? c.cachedMediaCost : c.textCost;
  return contents.length === 0 ? c.textCost : Math.max(...contents.map(price));
}

/** Düşük kredi seviyesi: "EMPTY" (bitti), eşik yüzdesi (ör. 20, 5) ya da null (sorun yok).
 * Yüzde, aylık paket kredisine göre hesaplanır; paket yoksa sadece "bitti" bildirilir. */
export function alertLevel(b: Balance, monthlyCredits: number | null, thresholds: number[]): "EMPTY" | number | null {
  const total = totalOf(b);
  if (total <= 0) return "EMPTY";
  if (!monthlyCredits || monthlyCredits <= 0) return null;
  const percent = (total / monthlyCredits) * 100;
  const hit = [...thresholds].sort((a, b2) => a - b2).find((t) => percent <= t);
  return hit ?? null;
}

/** Yeni seviye daha önce bildirilenden daha kötüyse bildirim gerekir. */
export function shouldAlert(level: "EMPTY" | number | null, lastNotified: number | null, emptyNotified: boolean): boolean {
  if (level === null) return false;
  if (level === "EMPTY") return !emptyNotified;
  return lastNotified === null || level < lastNotified;
}

/** Yaklaşık kalan cevap sayısı (metin cevabı bedeline göre). */
export const approxReplies = (b: Balance, textCost: number) => Math.max(0, Math.floor(totalOf(b) / Math.max(1, textCost)));
