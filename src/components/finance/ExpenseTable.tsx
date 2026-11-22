"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Pencil, Plus, X } from "lucide-react";
import {
  addExpense,
  updateExpense,
  deleteExpense,
  copyExpensesFromPreviousMonth,
} from "@/lib/actions/finance";
import { expenseTotal } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import type { ExpenseRow } from "./types";

export type DialogTarget = { mode: "add" } | { mode: "edit"; expense: ExpenseRow } | null;

/** Genel gider ve sabit gider formları aynı alanları kullanır; `variant` hangi
 * action'ların çağrılacağını ve başlıkları belirler. */
export function ExpenseDialog({
  target,
  year,
  month,
  onClose,
  onSave,
  onDelete,
  titles,
  saveHint,
}: {
  target: DialogTarget;
  year: number;
  month: number;
  onClose: () => void;
  onSave?: (editingId: string | null, formData: FormData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  titles?: { add: string; edit: string };
  saveHint?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (target) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [target]);

  const handleClose = () => {
    setError(null);
    setConfirmingDelete(false);
    onClose();
  };

  const editing = target?.mode === "edit" ? target.expense : null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
    >
      <form
        key={editing?.id ?? "new"}
        action={(formData) => {
          if (!target) return;
          setError(null);
          startTransition(async () => {
            try {
              if (onSave) await onSave(editing?.id ?? null, formData);
              else if (editing) await updateExpense(editing.id, formData);
              else await addExpense(year, month, formData);
              handleClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kaydedilemedi.");
            }
          });
        }}
        className="p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {editing ? (titles?.edit ?? "Gideri Düzenle") : (titles?.add ?? "Gider Ekle")}
          </h2>
          <button type="button" onClick={handleClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Tür</label>
            <input
              name="label"
              required
              defaultValue={editing?.label ?? ""}
              placeholder="Kira, Muhasebe, Aidat..."
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Birim fiyat (₺)
              </label>
              <input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={editing?.unitPrice ?? ""}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Adet</label>
              <input
                name="quantity"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={editing?.quantity ?? 1}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
              Not (opsiyonel)
            </label>
            <input
              name="note"
              defaultValue={editing?.note ?? ""}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {saveHint && <p className="mt-3 text-[11px] text-(--color-text-muted)">{saveHint}</p>}
        {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {editing &&
              (!onSave || onDelete) &&
              (confirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-(--color-text-muted)">Silinsin mi?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await (onDelete ?? deleteExpense)(editing.id);
                          handleClose();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Silinemedi.");
                        }
                      })
                    }
                    className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                  >
                    Evet, sil
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded px-2 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                  >
                    Vazgeç
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded px-2 py-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                >
                  Sil
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

export function ExpenseTable({
  year,
  month,
  expenses,
}: {
  year: number;
  month: number;
  expenses: ExpenseRow[];
}) {
  const [target, setTarget] = useState<DialogTarget>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = (fn: () => Promise<string | void>) =>
    startTransition(async () => {
      try {
        setMessage(null);
        const text = await fn();
        if (text) setMessage({ kind: "ok", text });
      } catch (e) {
        setMessage({ kind: "error", text: e instanceof Error ? e.message : "İşlem yapılamadı." });
      }
    });

  const total = expenses.reduce((s, e) => s + expenseTotal(e), 0);

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-4 py-3">
        <h2 className="text-sm font-bold">Genel Gider</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const count = await copyExpensesFromPreviousMonth(year, month);
                return count > 0
                  ? `${count} gider kalemi önceki aydan kopyalandı.`
                  : "Kopyalanacak yeni kalem bulunamadı.";
              })
            }
            title="Önceki ayın gider kalemlerini (kira, muhasebe vb.) bu aya kopyalar"
            className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-2.5 py-1.5 text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted) disabled:opacity-60"
          >
            <Copy size={13} />
            Önceki aydan kopyala
          </button>
          <button
            type="button"
            onClick={() => setTarget({ mode: "add" })}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={14} />
            Gider Ekle
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
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
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{e.label}</p>
                  {e.note && <p className="text-xs text-(--color-text-muted)">{e.note}</p>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {formatMoney(e.unitPrice)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {e.quantity}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(expenseTotal(e))}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setTarget({ mode: "edit", expense: e })}
                    aria-label="Düzenle"
                    className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-(--color-text-muted)">
                  Bu ay için gider kaydı yok.
                </td>
              </tr>
            )}
          </tbody>
          {expenses.length > 0 && (
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

      {message && (
        <p
          className={`px-4 pb-3 text-xs ${
            message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-brand-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <ExpenseDialog target={target} year={year} month={month} onClose={() => setTarget(null)} />
    </section>
  );
}
