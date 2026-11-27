import Link from "next/link";

export type DmTab = { key: string; label: string; badge?: number };

/** Sekme çubuğu (?sekme=...). Admin ve müşteri panelinde ortak. */
export function TabNav({ tabs, active, basePath }: { tabs: DmTab[]; active: string; basePath: string }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-(--color-border) px-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${basePath}?sekme=${t.key}`}
          scroll={false}
          className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            t.key === active ? "border-brand-600 text-brand-600" : "border-transparent text-(--color-text-muted) hover:text-(--color-text)"
          }`}
        >
          {t.label}
          {!!t.badge && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
