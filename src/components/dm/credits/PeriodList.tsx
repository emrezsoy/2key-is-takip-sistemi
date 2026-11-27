"use client";

import { cancelDmPeriod } from "@/lib/actions/dmCredits";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { cardCls, fmtDate } from "../ui";

export type PeriodRow = {
  id: string;
  planName: string;
  monthlyCredits: number;
  months: number;
  startDate: Date;
  paidThrough: Date;
  note: string | null;
  createdByName: string | null;
  cancelledAt: Date | null;
  hasIncome: boolean;
};

export function PeriodList({ rows, canCancel }: { rows: PeriodRow[]; canCancel: boolean }) {
  const { pending, error, info, run } = useAction();
  return (
    <div className={cardCls}>
      <h3 className="mb-2 text-sm font-bold">Abonelik dönemleri</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-(--color-text-muted)">Henüz ödeme girilmedi.</p>
      ) : (
        <ul className="divide-y divide-(--color-border) text-sm">
          {rows.map((p) => (
            <li key={p.id} className={`flex items-start justify-between gap-3 py-2 ${p.cancelledAt ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <p className="font-medium">
                  {p.planName} · {p.months} ay · aylık {p.monthlyCredits} kredi
                  {p.cancelledAt && <span className="ml-1 text-xs text-brand-600">(iptal)</span>}
                </p>
                <p className="text-[11px] text-(--color-text-muted)">
                  {fmtDate(p.startDate)} → {fmtDate(p.paidThrough)}
                  {p.note ? ` · ${p.note}` : ""}
                  {p.hasIncome ? " · Finans'a gelir girildi" : ""}
                  {p.createdByName ? ` · ${p.createdByName}` : ""}
                </p>
              </div>
              {canCancel && !p.cancelledAt && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Bu dönem iptal edilsin mi? Yüklenmiş krediye dokunulmaz (gerekirse düzeltme ile alın).")) {
                      run(() => cancelDmPeriod(p.id), "Dönem iptal edildi.");
                    }
                  }}
                  className="shrink-0 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                >
                  İptal et
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Feedback error={error} info={info} />
    </div>
  );
}
