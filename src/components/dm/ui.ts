// Mesaj Otomasyonu ekranlarında ortak sınıflar ve metinler.
export const inputCls =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";
export const labelCls = "mb-1 block text-xs font-medium text-(--color-text-muted)";
export const cardCls = "rounded-xl border border-(--color-border) bg-(--color-surface) p-4";
export const btnPrimary =
  "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60";
export const btnSecondary =
  "rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60";
export const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold";

export const SUB_LABEL: Record<string, { text: string; cls: string }> = {
  ACTIVE: { text: "Aktif", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  GRACE: { text: "Ödeme bekleniyor", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  EXPIRED: { text: "Abonelik bitti", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
  NONE: { text: "Paket yok", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

export const LEDGER_LABEL: Record<string, string> = {
  PLAN_GRANT: "Aylık paket kredisi",
  PLAN_EXPIRE: "Kullanılmayan paket kredisi silindi",
  TOPUP: "Kalıcı kredi yüklemesi",
  ADJUSTMENT: "Düzeltme",
  USAGE: "Kullanım",
  REFUND: "İade",
};

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(d)) : "—";

export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date(d))
    : "—";
