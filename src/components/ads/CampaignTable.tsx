import { formatDate, formatMoney } from "@/lib/format";
import {
  CAMPAIGN_STATUS_CHIP,
  CAMPAIGN_STATUS_CHIP_DEFAULT,
  CAMPAIGN_STATUS_LABEL,
  OBJECTIVE_LABEL,
  costPerResult,
  cpc,
  ctr,
  type Totals,
} from "./stats";
import { CampaignActions, type ActionCampaign } from "./CampaignActions";

export type CampaignRow = {
  metaId: string;
  name: string;
  clientName: string;
  effectiveStatus: string;
  objective: string | null;
  dailyBudget: number | null;
  startTime: Date | null;
  stopTime: Date | null;
  totals: Totals;
  createdTime?: Date | null;
  /** Reklam Paneli'nde işlem butonları (ayrıntı herkese; yönetim yetkisi olana durdur / yayına al / düzenle / kopyala). */
  action?: { campaign: ActionCampaign; manageable: boolean };
};

const nf = new Intl.NumberFormat("tr-TR");

export function CampaignTable({
  title,
  hint,
  rows,
  showBudget,
  emptyText,
  showActions,
}: {
  title: string;
  hint?: string;
  rows: CampaignRow[];
  showBudget?: boolean;
  emptyText: string;
  showActions?: boolean;
}) {
  const cols = (showBudget ? 9 : 8) + (showActions ? 1 : 0);
  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface)">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-(--color-border) px-4 py-3">
        <h2 className="text-sm font-bold">
          {title} <span className="font-normal text-(--color-text-muted)">({rows.length})</span>
        </h2>
        {hint && <span className="text-[11px] text-(--color-text-muted)">{hint}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-[11px] uppercase text-(--color-text-muted)">
            <tr>
              <th className="px-4 py-2 font-semibold">Kampanya</th>
              <th className="px-3 py-2 font-semibold">Durum</th>
              {showBudget && <th className="px-3 py-2 text-right font-semibold">Günlük bütçe</th>}
              <th className="px-3 py-2 text-right font-semibold">Harcama</th>
              <th className="px-3 py-2 text-right font-semibold">Gösterim</th>
              <th className="px-3 py-2 text-right font-semibold">Tıklama</th>
              <th className="px-3 py-2 text-right font-semibold">TO</th>
              <th className="px-3 py-2 text-right font-semibold">TBM</th>
              <th className="px-3 py-2 text-right font-semibold">Sonuç</th>
              {showActions && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {rows.map((r) => (
              <tr key={r.metaId}>
                <td className="px-4 py-2.5">
                  <p className="max-w-[320px] truncate font-medium" title={r.name}>
                    {r.name}
                  </p>
                  <p className="text-xs text-(--color-text-muted)">
                    {r.clientName}
                    {r.objective && ` · ${OBJECTIVE_LABEL[r.objective] ?? r.objective}`}
                    {r.startTime && ` · ${formatDate(r.startTime)}`}
                    {r.stopTime && r.effectiveStatus !== "ACTIVE" && ` – ${formatDate(r.stopTime)}`}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      CAMPAIGN_STATUS_CHIP[r.effectiveStatus] ?? CAMPAIGN_STATUS_CHIP_DEFAULT
                    }`}
                  >
                    {CAMPAIGN_STATUS_LABEL[r.effectiveStatus] ?? r.effectiveStatus}
                  </span>
                </td>
                {showBudget && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                    {r.dailyBudget != null ? formatMoney(r.dailyBudget) : "—"}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(Math.round(r.totals.spend * 100) / 100)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(r.totals.impressions)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(r.totals.clicks)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {r.totals.impressions > 0 ? `%${ctr(r.totals).toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-muted)">
                  {r.totals.clicks > 0 ? formatMoney(Math.round(cpc(r.totals) * 100) / 100) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.totals.results > 0 ? (
                    <>
                      {nf.format(r.totals.results)}
                      <span className="block text-[11px] text-(--color-text-muted)">
                        {formatMoney(Math.round(costPerResult(r.totals) * 100) / 100)} / sonuç
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                {showActions && (
                  <td className="px-3 py-2.5 text-right">
                    {r.action && <CampaignActions campaign={r.action.campaign} manageable={r.action.manageable} />}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={cols}
                  className="px-4 py-8 text-center text-sm text-(--color-text-muted)"
                >
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
