export const CLIENT_STATUS_LABEL: Record<string, string> = {
  TODO: "Sırada",
  IN_PROGRESS: "Üzerinde çalışılıyor",
  PENDING_APPROVAL: "Son kontrolde",
  DONE: "Tamamlandı",
};

export const CLIENT_STATUS_STYLE: Record<string, string> = {
  TODO: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PENDING_APPROVAL: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
};

export const REQUEST_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  REJECTED: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
};

export const monthTitle = (year: number, month: number) =>
  new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

export const NOTIFY_LABEL: Record<"DAILY" | "WEEKLY" | "LOGIN_POPUP" | "HOURLY" | "NONE", string> = {
  DAILY: "Her gün telefona bildirim",
  WEEKLY: "Haftada 1 telefona bildirim",
  LOGIN_POPUP: "Sadece panele her girişte açılır pencere",
  HOURLY: "Saat başı telefona bildirim",
  NONE: "Bildirim yok",
};
