"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarArrowUp, Pencil, Plus, Repeat, X } from "lucide-react";
import {
  addIncome,
  updateIncome,
  deleteIncome,
  cycleIncomeCollection,
  toggleIncomeInvoiced,
  moveIncomesToNextMonth,
} from "@/lib/actions/finance";
import { COLLECTION_LABEL, incomeVat, type CollectionKey } from "@/lib/finance";
import { MONTHS, formatMoney } from "@/lib/format";
import type { IncomeRow } from "./types";

// Sınıf adları tam literal (Tailwind taraması için).
const COLLECTION_CHIP: Record<CollectionKey, string> = {
  NONE: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
  HALF: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  FULL: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  PARTIAL: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

type DialogTarget = { mode: "add" } | { mode: "edit"; income: IncomeRow } | null;

/** Tahsilat seçimi; "Kısmi tahsilat" seçilince müşterinin ödediği özel tutar girilir. */
function CollectionField({
  initialCollection,
  initialPaid,
}: {
  initialCollection: CollectionKey;
  initialPaid: number | null;
}) {
  const [collection, setCollection] = useState<CollectionKey>(initialCollection);
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Tahsilat</label>
      <select
        name="collection"
        value={collection}
        onChange={(e) => setCollection(e.target.value as CollectionKey)}
        className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
      >
        <option value="NONE">{COLLECTION_LABEL.NONE}</option>
        <option value="HALF">{COLLECTION_LABEL.HALF}</option>
        <option value="FULL">{COLLECTION_LABEL.FULL}</option>
        <option value="PARTIAL">Kısmi tahsilat (tutar gir)</option>
      </select>
      {collection === "PARTIAL" && (
        <div className="mt-2">
          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
            Tahsil edilen tutar (₺)
          </label>
          <input
            name="collectedAmount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initialPaid ?? ""}
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
      )}
    </div>
  );
}

function IncomeDialog({
  target,
  year,
  month,
  clientNames,
  onClose,
}: {
  target: DialogTarget;
  year: number;
  month: number;
  clientNames: string[];
  onClose: () => void;
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

  const editing = target?.mode === "edit" ? target.income : null;

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
              if (editing) await updateIncome(editing.id, formData);
              else await addIncome(year, month, formData);
              handleClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kaydedilemedi.");
            }
          });
        }}
        className="p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? "Geliri Düzenle" : "Gelir Ekle"}</h2>
          <button type="button" onClick={handleClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Firma / Müşteri
              </label>
              <input
                name="clientName"
                required
                list="finance-client-names"
                defaultValue={editing?.clientName ?? ""}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <datalist id="finance-client-names">
                {clientNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Hizmet
              </label>
              <input
                name="service"
                defaultValue={editing?.service ?? ""}
                placeholder="Sosyal Medya, Çekim..."
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Tutar (₺)
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={editing?.amount ?? ""}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <CollectionField
              initialCollection={editing?.collection ?? "NONE"}
              initialPaid={editing?.collectedAmount ?? null}
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-(--color-border) bg-(--color-surface-muted) px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="recurring"
              defaultChecked={editing?.recurring ?? false}
              className="mt-0.5 h-4 w-4 rounded border-(--color-border)"
            />
            <span>
              <span className="font-medium">Aylık düzenli</span>
              <span className="block text-[11px] text-(--color-text-muted)">
                Aynı tutar her ay otomatik eklenir; bir sonraki ayın kaydı şimdiden görünür. İşareti kaldırırsanız sonraki
                aylarda otomatik oluşmuş, tahsil edilmemiş kayıtlar silinir.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="invoiced"
              defaultChecked={editing?.invoiced ?? false}
              className="h-4 w-4 rounded border-(--color-border)"
            />
            Fatura kesildi (KDV %20 hesaplanır)
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
              KDV tutarı (opsiyonel — boşsa otomatik %20)
            </label>
            <input
              name="vatOverride"
              type="number"
              step="0.01"
              min="0"
              defaultValue={editing?.vatOverride ?? ""}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
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

        {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {editing &&
              (confirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-(--color-text-muted)">Silinsin mi?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await deleteIncome(editing.id);
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

export function IncomeTable({
  year,
  month,
  incomes,
  clientNames,
}: {
  year: number;
  month: number;
  incomes: IncomeRow[];
  clientNames: string[];
}) {
  const [target, setTarget] = useState<DialogTarget>(null);
  const [movePending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmMove, setConfirmMove] = useState(false);

  // Ay değişince ya da kayıt silinince seçim kendiliğinden temizlenir.
  const ids = new Set(incomes.map((i) => i.id));
  const picked = selected.filter((id) => ids.has(id));
  const movable = incomes.filter((i) => i.collection !== "FULL");
  const allPicked = movable.length > 0 && movable.every((i) => picked.includes(i.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const nextLabel = `${MONTHS[month === 12 ? 0 : month]}${month === 12 ? ` ${year + 1}` : ""}`;

  const moveSelected = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const r = await moveIncomesToNextMonth(picked, year, month);
      setConfirmMove(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSelected([]);
      const parts = [
        r.moved ? `${r.moved} gelir ${nextLabel} ayına aktarıldı` : "",
        r.split ? `${r.split} gelirin kalan tutarı ${nextLabel} ayına aktarıldı (tahsil edilen kısım bu ayda kaldı)` : "",
        r.skipped ? `${r.skipped} gelir tamamı tahsil edildiği için aktarılmadı` : "",
      ].filter(Boolean);
      setInfo(parts.join(" · ") || "Aktarılacak gelir yoktu.");
    });

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
      }
    });

  const totalAmount = incomes.reduce((s, i) => s + i.amount, 0);
  const totalVat = incomes.reduce((s, i) => s + incomeVat(i), 0);

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface)">
      <div className="flex items-center justify-between gap-3 border-b border-(--color-border) px-4 py-3">
        <h2 className="text-sm font-bold">Ciro (Gelirler)</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {picked.length > 0 &&
            (confirmMove ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 dark:border-amber-700 dark:bg-amber-900/20">
                <span className="text-[11px]">
                  {picked.length} gelir {nextLabel} ayına aktarılsın mı?
                </span>
                <button
                  type="button"
                  disabled={movePending}
                  onClick={moveSelected}
                  className="rounded px-2 py-0.5 text-xs font-semibold text-brand-600 hover:bg-white disabled:opacity-60 dark:hover:bg-ink-800"
                >
                  {movePending ? "Aktarılıyor..." : "Evet, aktar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMove(false)}
                  className="rounded px-2 py-0.5 text-xs text-(--color-text-muted) hover:bg-white dark:hover:bg-ink-800"
                >
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmMove(true)}
                className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold hover:bg-(--color-surface-muted)"
              >
                <CalendarArrowUp size={14} />
                Seçilenleri sonraki aya aktar ({picked.length})
              </button>
            ))}
          <button
            type="button"
            onClick={() => setTarget({ mode: "add" })}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={14} />
            Gelir Ekle
          </button>
        </div>
      </div>
      {info && (
        <p className="border-b border-(--color-border) bg-emerald-50 px-4 py-2 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          {info}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="text-[11px] uppercase text-(--color-text-muted)">
            <tr>
              <th className="w-8 py-2 pl-4">
                <input
                  type="checkbox"
                  aria-label="Tahsil edilmemiş tüm gelirleri seç"
                  title="Tahsil edilmemiş tüm gelirleri seç"
                  checked={allPicked}
                  disabled={movable.length === 0}
                  onChange={() => setSelected(allPicked ? [] : movable.map((i) => i.id))}
                  className="h-4 w-4 rounded border-(--color-border)"
                />
              </th>
              <th className="px-3 py-2 font-semibold">Firma / Hizmet</th>
              <th className="px-3 py-2 text-right font-semibold">Tutar</th>
              <th className="px-3 py-2 text-right font-semibold">KDV</th>
              <th className="px-3 py-2 font-semibold">Fatura</th>
              <th className="px-3 py-2 font-semibold">Tahsilat</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {incomes.map((i) => (
              <tr key={i.id} className={picked.includes(i.id) ? "bg-amber-50/60 dark:bg-amber-900/10" : undefined}>
                <td className="py-2.5 pl-4 align-top">
                  <input
                    type="checkbox"
                    aria-label={`${i.clientName} gelirini seç`}
                    title={i.collection === "FULL" ? "Tamamı tahsil edilmiş gelir aktarılamaz" : "Sonraki aya aktarmak için seç"}
                    checked={picked.includes(i.id)}
                    disabled={i.collection === "FULL"}
                    onChange={() => toggle(i.id)}
                    className="mt-0.5 h-4 w-4 rounded border-(--color-border) disabled:opacity-40"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <p className="flex items-center gap-1.5 font-medium">
                    {i.clientName}
                    {i.recurring && (
                      <span
                        title="Aylık düzenli: her ay otomatik tekrar eder"
                        className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      >
                        <Repeat size={10} />
                        Aylık
                      </span>
                    )}
                  </p>
                  {(i.service || i.note) && (
                    <p className="text-xs text-(--color-text-muted)">
                      {[i.service, i.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(i.amount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {i.invoiced ? formatMoney(incomeVat(i)) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => run(() => toggleIncomeInvoiced(i.id))}
                    title="Fatura durumunu değiştir"
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      i.invoiced
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                        : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400"
                    }`}
                  >
                    {i.invoiced ? "Faturalı" : "Faturasız"}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => run(() => cycleIncomeCollection(i.id))}
                    title="Tahsilat durumunu değiştir (Bekliyor → Yarısı → Tahsil edildi)"
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${COLLECTION_CHIP[i.collection]}`}
                  >
                    {i.collection === "PARTIAL"
                      ? `${formatMoney(i.collectedAmount ?? 0)} tahsil edildi`
                      : COLLECTION_LABEL[i.collection]}
                  </button>
                  {i.collection === "PARTIAL" && (
                    <p className="mt-0.5 text-[11px] text-(--color-text-muted)">
                      Kalan: {formatMoney(Math.max(i.amount - (i.collectedAmount ?? 0), 0))}
                    </p>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setTarget({ mode: "edit", income: i })}
                    aria-label="Düzenle"
                    className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {incomes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-(--color-text-muted)">
                  Bu ay için gelir kaydı yok.
                </td>
              </tr>
            )}
          </tbody>
          {incomes.length > 0 && (
            <tfoot className="border-t border-(--color-border) bg-(--color-surface-muted) text-sm font-semibold">
              <tr>
                <td />
                <td className="px-3 py-2.5">Toplam</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totalAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totalVat)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {error && <p className="px-4 pb-3 text-xs text-brand-600">{error}</p>}

      <IncomeDialog
        target={target}
        year={year}
        month={month}
        clientNames={clientNames}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}
