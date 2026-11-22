import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";

export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: tr });
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Finans için kuruşlu para biçimi (ör. ₺4.873,99). */
export function formatMoney(amount: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDayMonth(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

/** İşi verenin kartlarda görünen adı: müşteri talebiyse "Müşteri talebi", değilse işi veren kişinin adı. */
export const CLIENT_REQUEST_LABEL = "Müşteri talebi";
export const CLIENT_REVISION_LABEL = "Müşteri revizesi";
/** Kartlarda kırmızı vurgulanan, müşteriden gelen iş etiketleri. */
export const isClientOriginLabel = (label: string | null | undefined) =>
  label === CLIENT_REQUEST_LABEL || label === CLIENT_REVISION_LABEL;
export const creatorLabelOf = (u: { fullName: string; role: string }, requestKind?: string | null) =>
  u.role === "CLIENT" ? (requestKind === "REVISION" ? CLIENT_REVISION_LABEL : CLIENT_REQUEST_LABEL) : u.fullName;

export const ROLE_LABEL: Record<string, string> = {
  CLIENT: "Müşteri",
  ADMIN: "Admin",
  SUPERVISOR: "Süpervizör",
  EMPLOYEE: "Çalışan",
};

export const URGENCY_LABEL: Record<string, string> = {
  LOW: "Düşük",
  MEDIUM: "Orta",
  HIGH: "Yüksek",
  URGENT: "Acil",
};

export const URGENCY_STYLE: Record<string, string> = {
  LOW: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  HIGH: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  URGENT: "bg-brand-600 text-white",
};

// Müşteri panosundaki iş satırları için aciliyet renkleri (kırmızı = en acil).
// Sınıf adları tam literal olmalı ki Tailwind taraması bulabilsin.
export const URGENCY_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

export const URGENCY_BAR: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-amber-400",
  LOW: "bg-sky-400",
};

export const URGENCY_CHIP: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  LOW: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};

export const STATUS_CHIP: Record<string, string> = {
  TODO: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  PENDING_APPROVAL: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  DONE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

export const STATUS_LABEL: Record<string, { admin: string; employee: string }> = {
  TODO: { admin: "Yapılacak", employee: "Yapılacak" },
  IN_PROGRESS: { admin: "Devam Ediyor", employee: "Devam Ediyor" },
  PENDING_APPROVAL: { admin: "Onay Bekliyor", employee: "Teslim Bekliyor" },
  DONE: { admin: "Tamamlandı", employee: "Tamamlandı" },
};

export const STATUS_BAR_COLOR: Record<string, string> = {
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-progress",
  PENDING_APPROVAL: "bg-status-review",
  DONE: "bg-status-done",
};

export const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export const DAY_TYPE_LABEL: Record<string, string> = {
  NONE: "Boş",
  HALF: "Yarım gün",
  FULL: "Tam gün",
  LEAVE: "İzinli",
};
