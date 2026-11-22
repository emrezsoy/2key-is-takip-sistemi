"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Table2 } from "lucide-react";
import { monthTitle } from "@/lib/portalText";
import { ContentTable, type ItemRow } from "./ContentTable";
import { ContentDocs, type DocRow } from "./ContentDocs";
import type { ContentMonth } from "@/lib/contentData";

/** İçerik Paneli: ay seçici + iki modül (tablo / düz yazı). Müşteri paneli ve admin/ekip tarafında ortak kullanılır. */
export function ContentWorkspace({
  clientId,
  basePath,
  year,
  month,
  items,
  docs,
  canEdit,
  canAddJob = false,
  months = [],
  canReview = false,
  canRevise = false,
  canSendCalendar = false,
  canClearDelivery = false,
  clientView = false,
}: {
  clientId: string;
  /** Ay gezintisi için sayfa adresi (ör. /panel/icerik). */
  basePath: string;
  year: number;
  month: number;
  items: ItemRow[];
  docs: DocRow[];
  canEdit: boolean;
  /** Admin ve müşteri sorumlusu: tablo satırını iş olarak ekleyebilir. */
  canAddJob?: boolean;
  /** İçerik girilmiş aylar: sonraki aylara önceden yazılan içerik de görünsün diye ay çipleri olarak gösterilir. */
  months?: ContentMonth[];
  /** Müşteri paneli: tamamlanan işi onaylayabilir / revize isteyebilir. */
  canReview?: boolean;
  canRevise?: boolean;
  /** Ekip: onaylanan teslimi paylaşım takvimine gönderebilir / yanlış teslimi kaldırabilir. */
  canSendCalendar?: boolean;
  canClearDelivery?: boolean;
  /** Müşteri paneli: işleme alınan (iş olarak eklenen) satırlar kilitlenir. */
  clientView?: boolean;
}) {
  const [tab, setTab] = useState<"table" | "docs">("table");
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  // Seçili ay içeriksiz olsa bile çiplerde görünsün.
  const chips = months.some((c) => c.year === year && c.month === month)
    ? months
    : [...months, { year, month, count: 0, pending: 0 }].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-(--color-surface-muted) p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab("table")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === "table" ? "bg-(--color-surface) shadow-sm" : "text-(--color-text-muted)"}`}
          >
            <Table2 size={14} /> Tablo ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("docs")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === "docs" ? "bg-(--color-surface) shadow-sm" : "text-(--color-text-muted)"}`}
          >
            <FileText size={14} /> Düz yazı ({docs.length})
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={`${basePath}?y=${prev.y}&m=${prev.m}`}
            aria-label="Önceki ay"
            className="rounded-lg p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={18} />
          </Link>
          <span className="min-w-36 text-center text-sm font-bold capitalize">{monthTitle(year, month)}</span>
          <Link
            href={`${basePath}?y=${next.y}&m=${next.m}`}
            aria-label="Sonraki ay"
            className="rounded-lg p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      {chips.length > 1 && (
        <nav aria-label="İçerik girilmiş aylar" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {chips.map((c) => {
            const active = c.year === year && c.month === month;
            return (
              <Link
                key={`${c.year}-${c.month}`}
                href={`${basePath}?y=${c.year}&m=${c.month}`}
                aria-current={active ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-(--color-border) text-(--color-text-muted) hover:border-brand-500 hover:text-brand-600"
                }`}
              >
                {monthTitle(c.year, c.month)}
                {c.count > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/25" : "bg-(--color-surface-muted)"}`}>{c.count}</span>
                )}
                {c.pending > 0 && (
                  <span
                    title={`${c.pending} içerik onayınızı bekliyor`}
                    className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white"
                  >
                    {c.pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Ay değişince içerik yeniden kurulsun diye key kullanılıyor. */}
      {tab === "table" ? (
        <ContentTable
          key={`${clientId}-${year}-${month}`}
          clientId={clientId}
          year={year}
          month={month}
          items={items}
          canEdit={canEdit}
          canAddJob={canAddJob}
          canReview={canReview}
          canRevise={canRevise}
          canSendCalendar={canSendCalendar}
          canClearDelivery={canClearDelivery}
          clientView={clientView}
        />
      ) : (
        <ContentDocs key={`${clientId}-${year}-${month}`} clientId={clientId} year={year} month={month} docs={docs} canEdit={canEdit} />
      )}
    </div>
  );
}
