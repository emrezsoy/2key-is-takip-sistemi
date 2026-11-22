import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { formatMoney } from "@/lib/format";
import { BarChart } from "@/components/ads/BarChart";
import { GoogleAdsReport } from "@/components/ads/GoogleAdsReport";
import { CampaignTable, type CampaignRow } from "@/components/ads/CampaignTable";
import {
  addDays,
  addTo,
  costPerResult,
  displayStatus,
  cpc,
  ctr,
  dailySeries,
  emptyTotals,
  type InsightRow,
} from "@/components/ads/stats";

const nf = new Intl.NumberFormat("tr-TR");
const money = (n: number) => formatMoney(Math.round(n * 100) / 100);

const RANGES: { key: string; label: string }[] = [
  { key: "7", label: "7 gün" },
  { key: "30", label: "30 gün" },
  { key: "90", label: "90 gün" },
  { key: "ay", label: "Bu ay" },
  { key: "365", label: "1 yıl" },
];

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

function Notice({ title, children, tone = "muted" }: { title: string; children: React.ReactNode; tone?: "muted" | "info" }) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        tone === "info" ? "border-brand-500/40 bg-brand-50 dark:bg-brand-900/10" : "border-dashed border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <p className="text-sm font-bold">{title}</p>
      <div className="mt-1 text-sm text-(--color-text-muted)">{children}</div>
    </div>
  );
}

/** Müşteri paneli: yalnızca kendi müşterisine bağlı ve yönetim hizmeti aldığı platformların reklam verileri (salt okunur). */
export default async function PortalAds({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requirePortalUser();
  const { range: rangeParam } = await searchParams;
  const range = RANGES.some((r) => r.key === rangeParam) ? rangeParam! : "30";

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: user.clientId },
    select: { metaAdsManaged: true, googleAdsManaged: true },
  });

  // Hiçbir reklam yönetimi hizmeti alınmıyorsa veri gösterilmez (müşteri kendi reklamlarını yönetiyor olsa bile).
  if (!client.metaAdsManaged && !client.googleAdsManaged) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Reklamlar</h1>
        <Notice title="Reklam yönetimi hizmeti almıyorsunuz">
          Reklam verileri yalnızca ajansımızın yönettiği reklam hesapları için bu panelde gösterilir. Şu an Meta (Facebook /
          Instagram) veya Google reklam yönetimi hizmeti almadığınız için burada veri bulunmuyor. Bu hizmeti almak isterseniz
          bizimle iletişime geçebilirsiniz.
        </Notice>
      </div>
    );
  }

  const until = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const since = range === "ay" ? `${until.slice(0, 8)}01` : addDays(until, -(Number(range) - 1));

  const accounts = client.metaAdsManaged
    ? await prisma.adAccount.findMany({ where: { clientId: user.clientId }, select: { id: true, lastSyncAt: true } })
    : [];
  const accountIds = accounts.map((a) => a.id);
  const googleAccounts = client.googleAdsManaged
    ? await prisma.googleAdAccount.findMany({ where: { clientId: user.clientId }, select: { id: true } })
    : [];

  const [insightsRaw, campaignsRaw] = client.metaAdsManaged
    ? await Promise.all([
        prisma.adInsightDaily.findMany({ where: { adAccountId: { in: accountIds }, date: { gte: since, lte: until } } }),
        prisma.adCampaign.findMany({ where: { adAccountId: { in: accountIds } } }),
      ])
    : [[], []];

  const rows: InsightRow[] = insightsRaw.map((r) => ({
    date: r.date,
    adAccountId: r.adAccountId,
    campaignMetaId: r.campaignMetaId,
    spend: Number(r.spend),
    impressions: r.impressions,
    reach: r.reach,
    clicks: r.clicks,
    linkClicks: r.linkClicks,
    messages: r.messages,
    leads: r.leads,
    purchases: r.purchases,
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
    metaId: c.metaId,
    name: c.name,
    clientName: user.clientName,
    effectiveStatus: displayStatus(c.effectiveStatus, c.stopTime),
    objective: c.objective,
    dailyBudget: c.dailyBudget == null ? null : Number(c.dailyBudget),
    startTime: c.startTime,
    stopTime: c.stopTime,
    totals: byCampaign.get(c.metaId) ?? emptyTotals(),
  }));
  const active = campaignRows.filter((c) => c.effectiveStatus === "ACTIVE").sort((a, b) => b.totals.spend - a.totals.spend);
  const past = campaignRows
    .filter((c) => c.effectiveStatus !== "ACTIVE" && c.totals.spend > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend);

  const lastSync = accounts
    .map((a) => a.lastSyncAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  // Hizmet alınıyor ama seçili aralıkta hiç harcama / yayında kampanya yok: "aktif veri yok".
  const noActivity = totals.spend === 0 && totals.impressions === 0 && active.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reklamlar</h1>
        <p className="text-sm text-(--color-text-muted)">
          Ajansımızın yönettiği reklamların harcama ve performans özeti.
          {client.metaAdsManaged &&
            lastSync &&
            ` Meta son güncelleme: ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(lastSync)}.`}
        </p>
      </div>

      {client.metaAdsManaged && (
        <section className="space-y-5">
          <h2 className="text-base font-bold">Meta (Facebook / Instagram)</h2>

          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/panel/reklamlar?range=${r.key}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  range === r.key ? "bg-brand-600 text-white" : "border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>

          {accounts.length === 0 ? (
            <Notice title="Reklam hesabınızın bağlantısı kuruluyor">
              Meta reklam yönetimi hizmetiniz aktif. Reklam hesabınızın verileri bağlandığında burada görünecek.
            </Notice>
          ) : noActivity ? (
            <Notice title="Aktif veri yok">
              Seçili tarih aralığında yayında reklamınız bulunmadığı için gösterilecek veri yok. Ajansımız hesabınızı yönetmeye
              devam ediyor; reklam yayına girdiğinde veriler burada görünecek.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Harcama" value={money(totals.spend)} />
                <Kpi label="Gösterim" value={nf.format(totals.impressions)} sub={`Erişim: ${nf.format(totals.reach)}`} />
                <Kpi
                  label="Tıklama"
                  value={nf.format(totals.clicks)}
                  sub={totals.impressions > 0 ? `Tıklama oranı %${ctr(totals).toFixed(2)}` : undefined}
                />
                <Kpi
                  label="Sonuç"
                  value={nf.format(totals.results)}
                  sub={totals.results > 0 ? `Sonuç başı ${money(costPerResult(totals))}` : "Mesaj, form, satın alma"}
                />
              </div>
              {totals.clicks > 0 && (
                <p className="-mt-3 text-xs text-(--color-text-muted)">Tıklama başı maliyet: {money(cpc(totals))}</p>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                <BarChart title="Günlük harcama" points={series} valueKey="spend" barClass="bg-brand-500" money />
                <BarChart title="Günlük tıklama" points={series} valueKey="clicks" barClass="bg-sky-500" />
                <BarChart title="Günlük sonuç" points={series} valueKey="results" barClass="bg-emerald-500" />
              </div>

              <CampaignTable
                title="Aktif kampanyalar"
                hint="Harcama ve sonuçlar seçili tarih aralığına aittir."
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
            </>
          )}
        </section>
      )}

      {client.googleAdsManaged && (
        <section className="space-y-4">
          <h2 className="text-base font-bold">Google Ads</h2>
          {!client.metaAdsManaged && (
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`/panel/reklamlar?range=${r.key}`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    range === r.key ? "bg-brand-600 text-white" : "border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                  }`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          )}
          {googleAccounts.length === 0 ? (
            <Notice title="Google reklam hesabınızın bağlantısı kuruluyor">
              Google reklam yönetimi hizmetiniz aktif. Hesabınızın verileri bağlandığında burada görünecek.
            </Notice>
          ) : (
            <GoogleAdsReport
              accountIds={googleAccounts.map((a) => a.id)}
              clientNameOf={new Map(googleAccounts.map((a) => [a.id, user.clientName]))}
              since={since}
              until={until}
              emptyText="Seçili tarih aralığında yayında Google reklamınız bulunmadığı için gösterilecek veri yok. Reklam yayına girdiğinde veriler burada görünecek."
            />
          )}
        </section>
      )}

      {!client.metaAdsManaged && (
        <p className="text-xs text-(--color-text-muted)">
          Meta (Facebook / Instagram) reklam yönetimi hizmeti almadığınız için Meta verileri bu panelde gösterilmez.
        </p>
      )}
      {!client.googleAdsManaged && (
        <p className="text-xs text-(--color-text-muted)">
          Google reklam yönetimi hizmeti almadığınız için Google verileri bu panelde gösterilmez.
        </p>
      )}
    </div>
  );
}
