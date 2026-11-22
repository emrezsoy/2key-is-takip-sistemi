"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, RotateCcw, Users, X } from "lucide-react";
import {
  addFixedExpense,
  updateFixedExpense,
  skipFixedExpenseThisMonth,
  endFixedExpenseFromMonth,
  restoreFixedExpense,
  skipEmployeeThisMonth,
  restoreEmployeeLine,
} from "@/lib/actions/finance";
import type { FixedLine } from "@/lib/finance";
import { MONTHS, formatMoney } from "@/lib/format";
import { ExpenseDialog, type DialogTarget } from "./ExpenseTable";

export function FixedExpenses({
  year,
  month,
  lines,
  skipped,
}: {
  year: number;
  month: number;
  lines: FixedLine[];
  skipped: FixedLine[];
}) {
  const [target, setTarget] = useState<DialogTarget>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
        setRemoving(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
      }
    });

  const total = lines.reduce((s, l) => s + l.total, 0);
  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const editingLine =
    target?.mode === "edit"
      ? lines.find((l) => l.kind === "template" && l.refId === target.expense.id)
      : undefined;

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Sabit Giderler</h2>
          <p className="text-[11px] text-(--color-text-muted)">
            Her aya otomatik devreder; çalışan ödemeleri puantajdan hesaplanır.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTarget({ mode: "add" })}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Plus size={14} />
          Sabit Gider Ekle
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-sm">
          <thead className="text-[11px] uppercase text-(--color-text-muted)">
            <tr>
              <th className="px-4 py-2 font-semibold">Tür</th>
              <th className="px-3 py-2 text-right font-semibold">Birim fiyat</th>
              <th className="px-3 py-2 text-right font-semibold">Adet</th>
              <th className="px-3 py-2 text-right font-semibold">Tutar</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="px-4 py-2.5">
                  <p className="flex items-center gap-1.5 font-medium">
                    {l.label}
                    {l.kind === "employee" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                        <Users size={10} />
                        Puantaj
                      </span>
                    )}
                  </p>
                  {l.note && <p className="text-xs text-(--color-text-muted)">{l.note}</p>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {formatMoney(l.unitPrice)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {l.quantity}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(l.total)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {removing === l.key ? (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            l.kind === "template"
                              ? skipFixedExpenseThisMonth(l.refId, year, month)
                              : skipEmployeeThisMonth(l.refId, year, month)
                          )
                        }
                        className="rounded px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                      >
                        Sadece {MONTHS[month - 1]}
                      </button>
                      {l.kind === "template" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => endFixedExpenseFromMonth(l.refId, year, month))}
                          className="rounded px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                        >
                          Bu aydan itibaren
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemoving(null)}
                        className="rounded px-2 py-1 text-[11px] text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                      >
                        Vazgeç
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end">
                      {l.kind === "template" && (
                        <button
                          type="button"
                          onClick={() =>
                            setTarget({
                              mode: "edit",
                              expense: {
                                id: l.refId,
                                label: l.label,
                                unitPrice: l.unitPrice,
                                quantity: l.quantity,
                                note: l.note,
                              },
                            })
                          }
                          aria-label="Düzenle"
                          className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemoving(l.key)}
                        aria-label={`${l.label} giderini kaldır`}
                        className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-(--color-text-muted)">
                  {monthLabel} için sabit gider yok.
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot className="border-t border-(--color-border) bg-(--color-surface-muted) text-sm font-semibold">
              <tr>
                <td className="px-4 py-2.5" colSpan={3}>
                  Toplam
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {skipped.length > 0 && (
        <div className="border-t border-(--color-border) px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase text-(--color-text-muted)">
            {MONTHS[month - 1]} ayı için kaldırılanlar
          </p>
          <ul className="flex flex-wrap gap-2">
            {skipped.map((l) => (
              <li key={l.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      l.kind === "template"
                        ? restoreFixedExpense(l.refId, year, month)
                        : restoreEmployeeLine(l.refId, year, month)
                    )
                  }
                  title="Bu ay için geri ekle"
                  className="flex items-center gap-1.5 rounded-full border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted) disabled:opacity-60"
                >
                  <RotateCcw size={11} />
                  {l.label} · {formatMoney(l.total)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="px-4 pb-3 text-xs text-brand-600">{error}</p>}

      <ExpenseDialog
        target={target}
        year={year}
        month={month}
        onClose={() => setTarget(null)}
        titles={{ add: "Sabit Gider Ekle", edit: "Sabit Gideri Düzenle" }}
        saveHint={
          editingLine
            ? `${monthLabel} ve sonraki aylar için geçerli olur; önceki aylar eski tutarıyla kalır.`
            : `${monthLabel} ayından itibaren her aya otomatik devreder.`
        }
        onSave={async (id, formData) => {
          if (id) await updateFixedExpense(id, year, month, formData);
          else await addFixedExpense(year, month, formData);
        }}
      />
    </section>
  );
}
