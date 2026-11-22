export type InsightRow = {
  date: string;
  adAccountId: string;
  campaignMetaId: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  messages: number;
  leads: number;
  purchases: number;
};

export type Totals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
};

export const emptyTotals = (): Totals => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 });

/** Sonuç = mesaj başlatma + potansiyel müşteri formu + satın alma. */
export const resultsOf = (r: Pick<InsightRow, "messages" | "leads" | "purchases">) =>
  r.messages + r.leads + r.purchases;

export function addTo(t: Totals, r: InsightRow) {
  t.spend += r.spend;
  t.impressions += r.impressions;
  t.reach += r.reach;
  t.clicks += r.clicks;
  t.results += resultsOf(r);
}

export const ctr = (t: Pick<Totals, "clicks" | "impressions">) =>
  t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
export const cpc = (t: Pick<Totals, "spend" | "clicks">) => (t.clicks > 0 ? t.spend / t.clicks : 0);
export const costPerResult = (t: Pick<Totals, "spend" | "results">) =>
  t.results > 0 ? t.spend / t.results : 0;

export type DayPoint = { date: string; spend: number; clicks: number; results: number };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** since..until arasındaki her günü (verisi olmayanlar sıfır) içeren günlük seri. */
export function dailySeries(rows: InsightRow[], since: string, until: string): DayPoint[] {
  const byDay = new Map<string, DayPoint>();
  for (let d = since; d <= until; d = addDays(d, 1)) {
    byDay.set(d, { date: d, spend: 0, clicks: 0, results: 0 });
  }
  for (const r of rows) {
    const p = byDay.get(r.date);
    if (!p) continue;
    p.spend += r.spend;
    p.clicks += r.clicks;
    p.results += resultsOf(r);
  }
  return [...byDay.values()];
}

export { addDays };

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Yayında",
  PAUSED: "Duraklatıldı",
  CAMPAIGN_PAUSED: "Duraklatıldı",
  ADSET_PAUSED: "Duraklatıldı",
  ARCHIVED: "Arşivlendi",
  DELETED: "Silindi",
  WITH_ISSUES: "Sorunlu",
  IN_PROCESS: "İşleniyor",
  PENDING_REVIEW: "İncelemede",
  DISAPPROVED: "Reddedildi",
  PENDING_BILLING_INFO: "Ödeme bekliyor",
  ENDED: "Sona erdi",
  DISCONNECTED: "Bağlantı yok",
};

/** Ekranda gösterilecek durum: Meta kampanyayı hâlâ "ACTIVE" sayabilir ama bitiş tarihi geçmişse yayında değildir. */
export function displayStatus(effectiveStatus: string, stopTime: Date | null, now: number = new Date().getTime()) {
  if (effectiveStatus === "ACTIVE" && stopTime && stopTime.getTime() < now) return "ENDED";
  return effectiveStatus;
}

// Sınıf adları tam literal (Tailwind taraması için).
export const CAMPAIGN_STATUS_CHIP: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  WITH_ISSUES: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  DISAPPROVED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};
export const CAMPAIGN_STATUS_CHIP_DEFAULT =
  "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300";

export const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_ENGAGEMENT: "Etkileşim",
  OUTCOME_LEADS: "Potansiyel müşteri",
  OUTCOME_SALES: "Satış",
  OUTCOME_TRAFFIC: "Trafik",
  OUTCOME_AWARENESS: "Bilinirlik",
  OUTCOME_APP_PROMOTION: "Uygulama",
  MESSAGES: "Mesajlar",
  LINK_CLICKS: "Trafik",
  POST_ENGAGEMENT: "Etkileşim",
  REACH: "Erişim",
  // Google Ads kampanya türleri
  SEARCH: "Arama",
  DISPLAY: "Görüntülü",
  SHOPPING: "Alışveriş",
  VIDEO: "Video",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Talep Oluşturma",
  SMART: "Akıllı",
  LOCAL: "Yerel",
  MULTI_CHANNEL: "Uygulama",
};
