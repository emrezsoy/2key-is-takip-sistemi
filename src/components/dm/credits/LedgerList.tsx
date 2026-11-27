import { LEDGER_LABEL, cardCls, fmtDateTime } from "../ui";

export type LedgerRow = {
  id: string;
  type: string;
  bucket: string;
  amount: number;
  note: string | null;
  createdByName: string | null;
  createdAt: Date;
};

/** Kredi hareketleri (kayıt defteri). Müşteri görünümünde kim yaptı bilgisi "2 Key Idea" olarak gösterilir. */
export function LedgerList({ rows, forClient = false }: { rows: LedgerRow[]; forClient?: boolean }) {
  return (
    <div className={cardCls}>
      <h3 className="mb-2 text-sm font-bold">Kredi geçmişi</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-(--color-text-muted)">Henüz kredi hareketi yok.</p>
      ) : (
        <ul className="divide-y divide-(--color-border) text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {LEDGER_LABEL[r.type] ?? r.type}
                  <span className="ml-1 text-[11px] font-normal text-(--color-text-muted)">
                    ({r.bucket === "PLAN" ? "paket" : "kalıcı"})
                  </span>
                </p>
                <p className="text-[11px] text-(--color-text-muted)">
                  {fmtDateTime(r.createdAt)}
                  {r.note ? ` · ${r.note}` : ""}
                  {r.createdByName ? ` · ${forClient ? "2 Key Idea" : r.createdByName}` : ""}
                </p>
              </div>
              <span className={`shrink-0 font-semibold ${r.amount >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-(--color-text)"}`}>
                {r.amount > 0 ? `+${r.amount}` : r.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
