// Teklifler sayfasının ortak sabitleri ve küçük yardımcıları (sunucu ve istemci tarafından kullanılır).

export const COMPANY_SIZES = [
  { key: "NEW", label: "Yeni Kurulmuş" },
  { key: "SMALL", label: "Küçük" },
  { key: "MEDIUM", label: "Orta" },
  { key: "LARGE", label: "Büyük" },
] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number]["key"];
export const SIZE_LABEL: Record<string, string> = Object.fromEntries(COMPANY_SIZES.map((s) => [s.key, s.label]));

export const KINDS = [
  { key: "PROPOSAL", label: "Teklif" },
  { key: "REPORT", label: "Rapor" },
] as const;
export type ProposalKind = (typeof KINDS)[number]["key"];
export const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));

export const SERVICES = [
  { key: "SOCIAL", label: "Sosyal Medya" },
  { key: "META_ADS", label: "Meta Reklam Yönetimi" },
  { key: "GOOGLE_ADS", label: "Google Reklam Yönetimi" },
  { key: "WEB_DESIGN", label: "Web Tasarımı" },
  { key: "OUTDOOR_SHOOT", label: "Dış Çekim" },
  { key: "STUDIO_SHOOT", label: "Stüdyo Çekim" },
  { key: "WEBSITE", label: "Web Sitesi" },
  { key: "SEO_AUTOMATION", label: "SEO Otomasyonu" },
  { key: "CUSTOM", label: "Özel" },
] as const;
export type ServiceKey = (typeof SERVICES)[number]["key"];
export const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICES.map((s) => [s.key, s.label]));
const SERVICE_KEYS = new Set<string>(SERVICES.map((s) => s.key));

export const STATUSES = [
  { key: "PENDING", label: "Sonuç bekleniyor" },
  { key: "REVISION", label: "Teklif revizesi istendi" },
  { key: "APPROVED", label: "Onay" },
  { key: "REJECTED", label: "Red" },
] as const;
export type ProposalStatus = (typeof STATUSES)[number]["key"];
export const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
/** Listede durum rozeti ve satır vurgusu. */
export const STATUS_CHIP: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  REVISION: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

/** Verildikten kaç gün sonra "işletmeyle iletişime geç" hatırlatması gider. */
export const REMIND_AFTER_DAYS: Record<string, number> = { REPORT: 2, PROPOSAL: 3 };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseServices(raw: string | null | undefined): ServiceKey[] {
  try {
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr) ? (arr.filter((k) => typeof k === "string" && SERVICE_KEYS.has(k)) as ServiceKey[]) : [];
  } catch {
    return [];
  }
}

/** Formdan gelen hizmet anahtarlarını temizler (geçersizleri atar, tekrarı kaldırır). */
export function cleanServices(values: unknown[]): ServiceKey[] {
  return [...new Set(values.map(String).filter((k) => SERVICE_KEYS.has(k)))] as ServiceKey[];
}

/** "2026-11-09" + gün sayısı -> "2026-11-12". */
export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Satırda gösterilecek telefon: sadece rakam ve + ile bağlantı için normalleştirilmiş hâli. */
export const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
