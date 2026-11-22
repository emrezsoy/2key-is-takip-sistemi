import Link from "next/link";
import { MONTHS, formatMoney } from "@/lib/format";
import type { FinanceSummary } from "@/lib/finance";

export type YearMonthRow = { month: number; s: FinanceSummary };

const COLS: { key: keyof FinanceSummary; label: string }[] = [
  { key: "ciro", label: "Ciro" },
  { key: "kdv", label: "KDV" },
  { key: "gider", label: "Gider" },
  { key: "net", label: "Net Gelir" },
  { key: "tahsil", label: "Tahsil Edilen" },
  { key: "giderSonrasiKasa", label: "Gider Sonrası Kasa" },
];

function Amount({ value }: { value: number }) {
  return (
    <span className={value < 0 ? "text-red-600 dark:text-red-400" : ""}>{formatMoney(value)}</span>
  );
}

export function YearOverview({
  year,
  selectedMonth,
  rows,
}: {
  year: number;
  selectedMonth: number;
  rows: YearMonthRow[];
}) {
  const totals = COLS.map((c) => ({
    key: c.key,
    value: rows.reduce((s, r) => s + r.s[c.key], 0),
  }));
  const maxBar = Math.max(1, ...rows.flatMap((r) => [r.s.ciro, r.s.gider]));

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface)">
      <div className="border-b border-(--color-border) px-4 py-3">
        <h2 className="text-sm font-bold">{year} Yıllık Özet</h2>
      </div>

      <div className="px-4 pt-4">
        <div className="flex h-36 items-end gap-1.5">
          {rows.map((r) => (
            <Link
              key={r.month}
              href={`/finans?year=${year}&month=${r.month}`}
              className={`group flex h-full flex-1 flex-col justify-end rounded-md px-0.5 ${
                r.month === selectedMonth ? "bg-brand-50 dark:bg-brand-900/10" : ""
              }`}
              title={`${MONTHS[r.month - 1]}: ciro ${formatMoney(r.s.ciro)}, gider ${formatMoney(r.s.gider)}`}
            >
              <div className="flex flex-1 items-end justify-center gap-0.5">
                <div
                  className="w-2.5 rounded-t bg-emerald-500 sm:w-3.5"
                  style={{ height: `${(r.s.ciro / maxBar) * 100}%` }}
                />
                <div
                  className="w-2.5 rounded-t bg-red-400 sm:w-3.5"
                  style={{ height: `${(r.s.gider / maxBar) * 100}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 text-[10px] text-(--color-text-muted)">
          {rows.map((r) => (
            <span key={r.month} className="flex-1 truncate text-center">
              {MONTHS[r.month - 1].slice(0, 3)}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-(--color-text-muted)">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Ciro
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-red-400" /> Gider
          </span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[11px] uppercase text-(--color-text-muted)">
            <tr>
              <th className="px-4 py-2 font-semibold">Ay</th>
              {COLS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {rows.map((r) => (
              <tr
                key={r.month}
                className={r.month === selectedMonth ? "bg-brand-50 dark:bg-brand-900/10" : ""}
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/finans?year=${year}&month=${r.month}`}
                    className="font-medium hover:text-brand-600"
                  >
                    {MONTHS[r.month - 1]}
                  </Link>
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                    <Amount value={r.s[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-(--color-border) bg-(--color-surface-muted) text-sm font-semibold">
            <tr>
              <td className="px-4 py-2.5">Toplam</td>
              {totals.map((t) => (
                <td key={t.key} className="px-3 py-2.5 text-right tabular-nums">
                  <Amount value={t.value} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
