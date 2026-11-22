import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { BarChart } from "@/components/ads/BarChart";
import { CampaignTable, type CampaignRow } from "@/components/ads/CampaignTable";
import { addTo, cpc, ctr, dailySeries, emptyTotals, type InsightRow } from "@/components/ads/stats";

const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const money = (n: number) => formatMoney(Math.round(n * 100) / 100);

// Google durumları, paylaşılan kampanya tablosunun beklediği kodlara çevrilir.
const STATUS: Record<string, string> = { ENABLED: "ACTIVE", PAUSED: "PAUSED", REMOVED: "ARCHIVED" };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

/** Google Ads verileri (salt okunur): KPI'lar, günlük grafikler ve kampanya tabloları.
 * `clientNameOf`: hesap -> müşteri adı (tabloda gösterilir). */
export async function GoogleAdsReport({
  accountIds,
  clientNameOf,
  since,
  until,
  emptyText,
}: {
  accountIds: string[];
  clientNameOf: Map<string, string>;
  since: string;
  until: string;
  emptyText: string;
}) {
  const [insightsRaw, campaignsRaw] = await Promise.all([
    prisma.googleAdInsightDaily.findMany({ where: { adAccountId: { in: accountIds }, date: { gte: since, lte: until } } }),
    prisma.googleAdCampaign.findMany({ where: { adAccountId: { in: accountIds } } }),
  ]);

  const rows: InsightRow[] = insightsRaw.map((r) => ({
    date: r.date,
    adAccountId: r.adAccountId,
    campaignMetaId: r.campaignId,
    spend: Number(r.cost),
    impressions: r.impressions,
    reach: 0,
    clicks: r.clicks,
    linkClicks: 0,
    messages: 0,
    leads: Number(r.conversions), // Google "dönüşüm" sayısı sonuç olarak gösterilir
    purchases: 0,
  }));

  const totals = emptyTotals();
  const byCampaign = new Map<string, ReturnType<typeof emptyTotals>>();
  for (const r of rows) {
    addTo(totals, r);
    const c = byCampaign.get(r.campaignMetaId) ?? emptyTotals();
    addTo(c, r);
    byCampaign.set(r.campaignMetaId, c);
  }
  const series = dailySeries(rows, since, until);

  const campaignRows: CampaignRow[] = campaignsRaw.map((c) => ({
    metaId: c.campaignId,
    name: c.name,
    clientName: clientNameOf.get(c.adAccountId) ?? "—",
    effectiveStatus: STATUS[c.status] ?? c.status,
    objective: c.channelType,
    dailyBudget: c.dailyBudget == null ? null : Number(c.dailyBudget),
    startTime: null,
    stopTime: null,
    totals: byCampaign.get(c.campaignId) ?? emptyTotals(),
  }));
  const active = campaignRows.filter((c) => c.effectiveStatus === "ACTIVE").sort((a, b) => b.totals.spend - a.totals.spend);
  const past = campaignRows
    .filter((c) => c.effectiveStatus !== "ACTIVE" && c.totals.spend > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend);

  if (totals.spend === 0 && totals.impressions === 0 && active.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--color-border) bg-(--color-surface) p-5">
        <p className="text-sm font-bold">Aktif veri yok</p>
        <p className="mt-1 text-sm text-(--color-text-muted)">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Harcama" value={money(totals.spend)} />
        <Kpi label="Gösterim" value={nf.format(totals.impressions)} />
        <Kpi
          label="Tıklama"
          value={nf.format(totals.clicks)}
          sub={totals.impressions > 0 ? `Tıklama oranı %${ctr(totals).toFixed(2)}` : undefined}
        />
        <Kpi
          label="Dönüşüm"
          value={nf.format(totals.results)}
          sub={totals.results > 0 ? `Dönüşüm başı ${money(totals.spend / totals.results)}` : "Arama, form, satın alma"}
        />
      </div>
      {totals.clicks > 0 && (
        <p className="-mt-3 text-xs text-(--color-text-muted)">Tıklama başı maliyet: {money(cpc(totals))}</p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <BarChart title="Günlük harcama" points={series} valueKey="spend" barClass="bg-brand-500" money />
        <BarChart title="Günlük tıklama" points={series} valueKey="clicks" barClass="bg-sky-500" />
        <BarChart title="Günlük dönüşüm" points={series} valueKey="results" barClass="bg-emerald-500" />
      </div>
      <CampaignTable
        title="Aktif kampanyalar"
        hint="Harcama ve dönüşümler seçili tarih aralığına aittir."
        rows={active}
        showBudget
        emptyText="Şu an yayında kampanya yok."
      />
      <CampaignTable
        title="Geçmiş kampanyalar"
        hint="Seçili aralıkta harcaması olan, yayında olmayan kampanyalar."
        rows={past}
        emptyText="Bu aralıkta geçmiş kampanya harcaması yok."
      />
    </div>
  );
}
