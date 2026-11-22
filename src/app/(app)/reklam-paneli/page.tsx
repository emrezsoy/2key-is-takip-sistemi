import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { canManageAds, canViewAdPanel, manageableAdAccounts } from "@/lib/adsAccess";
import { CampaignComposer } from "@/components/ads/CampaignComposer";
import type { ComposerAccount } from "@/lib/adsTypes";
import { getClientScope } from "@/lib/clientAccess";
import { isMetaConnected } from "@/lib/meta";
import { formatMoney } from "@/lib/format";
import { AdsToolbar } from "@/components/ads/AdsToolbar";
import { AdsSetup } from "@/components/ads/AdsSetup";
import { getGoogleStatus, GOOGLE_REDIRECT_URI } from "@/lib/googleAds";
import { GoogleAdsReport } from "@/components/ads/GoogleAdsReport";
import { GoogleAdsSetup } from "@/components/ads/GoogleAdsSetup";
import { BarChart } from "@/components/ads/BarChart";
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

export default async function ReklamPaneliPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; client?: string; google?: string; mesaj?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  if (!(await canViewAdPanel(session.user))) redirect("/");
  const admin = isAdmin(session.user);
  // Admin dışındakiler sadece sorumlu oldukları müşterilerin reklam hesaplarını görür.
  const scope = await getClientScope(session.user);
  const scopeWhere = scope ? { clientId: { in: scope } } : {};
  // Kampanya kurma / düzenleme: yetkisi olan, sadece yönetilebilir (ve sorumlu olduğu) hesaplarda.
  const manager = await canManageAds(session.user);
  const manageAccounts = manager ? await manageableAdAccounts(session.user) : [];
  const manageableIds = new Set(manageAccounts.map((a) => a.id));
  const composerAccounts: ComposerAccount[] = manageAccounts.map((a) => ({
    metaId: a.metaId,
    name: a.name,
    clientId: a.clientId,
    clientName: a.client?.name ?? null,
    currency: a.currency,
  }));

  const { range: rangeParam, client: clientParam, google: googleFlash, mesaj } = await searchParams;
  const range = ["7", "30", "90", "365", "ay"].includes(rangeParam ?? "") ? rangeParam! : "30";
  const clientId =
    clientParam && clientParam !== "all" && (scope === null || scope.includes(clientParam)) ? clientParam : "all";

  // Tarih aralığı Türkiye saatine göre.
  const until = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const since = range === "ay" ? `${until.slice(0, 8)}01` : addDays(until, -(Number(range) - 1));

  const [connected, accountsRaw, clients] = await Promise.all([
    isMetaConnected(),
    prisma.adAccount.findMany({
      where: scopeWhere,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const [googleStatus, googleAccountsRaw] = await Promise.all([
    getGoogleStatus(),
    prisma.googleAdAccount.findMany({
      where: scopeWhere,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const googleAccounts = clientId === "all" ? googleAccountsRaw : googleAccountsRaw.filter((a) => a.clientId === clientId);
  const googleClientOf = new Map(googleAccounts.map((a) => [a.id, a.client?.name ?? a.name]));

  const accounts = clientId === "all" ? accountsRaw : accountsRaw.filter((a) => a.clientId === clientId);
  const accountIds = accounts.map((a) => a.id);
  const clientOfAccount = new Map(accounts.map((a) => [a.id, a.client?.name ?? "Müşteri bağlanmamış"]));

  const [insightsRaw, campaignsRaw] = await Promise.all([
    prisma.adInsightDaily.findMany({
      where: { adAccountId: { in: accountIds }, date: { gte: since, lte: until } },
    }),
    prisma.adCampaign.findMany({ where: { adAccountId: { in: accountIds } } }),
  ]);

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
  const byClient = new Map<string, number>();
  for (const r of rows) {
    addTo(totals, r);
    const c = byCampaign.get(r.campaignMetaId) ?? emptyTotals();
    addTo(c, r);
    byCampaign.set(r.campaignMetaId, c);
    const name = clientOfAccount.get(r.adAccountId) ?? "—";
    byClient.set(name, (byClient.get(name) ?? 0) + r.spend);
  }
  const series = dailySeries(rows, since, until);

  const campaignRows: CampaignRow[] = campaignsRaw.map((c) => ({
    metaId: c.metaId,
    name: c.name,
    clientName: clientOfAccount.get(c.adAccountId) ?? "—",
    effectiveStatus: displayStatus(c.effectiveStatus, c.stopTime),
    objective: c.objective,
    dailyBudget: c.dailyBudget == null ? null : Number(c.dailyBudget),
    startTime: c.startTime,
    stopTime: c.stopTime,
    totals: byCampaign.get(c.metaId) ?? emptyTotals(),
    createdTime: c.createdTime,
    action: {
      campaign: {
        metaId: c.metaId,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effectiveStatus,
        dailyBudget: c.dailyBudget == null ? null : Number(c.dailyBudget),
        startTime: c.startTime ? c.startTime.toISOString() : null,
        stopTime: c.stopTime ? c.stopTime.toISOString() : null,
      },
      manageable: manageableIds.has(c.adAccountId),
    },
  }));

  const active = campaignRows
    .filter((c) => c.effectiveStatus === "ACTIVE")
    .sort((a, b) => b.totals.spend - a.totals.spend);
  // Bekleyen: yayında olmayan, seçili aralıkta harcaması olmayan, son 4 ayda kurulmuş kampanyalar (yeni kurulan taslaklar,
  // incelemedekiler, duraklatılmışlar). Daha eski ve harcamasız olanlar listeyi şişirmesin diye gösterilmez.
  const recent = Date.now() - 120 * 24 * 3600 * 1000;
  const pendingRows = campaignRows
    .filter((c) => c.effectiveStatus !== "ACTIVE" && c.totals.spend === 0 && c.createdTime && c.createdTime.getTime() > recent)
    .sort((a, b) => (b.createdTime?.getTime() ?? 0) - (a.createdTime?.getTime() ?? 0));
  // Geçmiş kampanyalar: yayında olmayanlar; seçili aralıkta hiç harcaması olmayanlar listeyi şişirmesin.
  const past = campaignRows
    .filter((c) => c.effectiveStatus !== "ACTIVE" && c.totals.spend > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend);

  const clientBars = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  const maxClient = Math.max(...clientBars.map(([, v]) => v), 1);

  const lastSync = accountsRaw
    .map((a) => a.lastSyncAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const setupAccounts = accountsRaw.map((a) => ({
    id: a.id,
    metaId: a.metaId,
    name: a.name,
    status: a.status,
    clientId: a.clientId,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reklam Paneli</h1>
        <p className="text-sm text-(--color-text-muted)">
          Meta (Facebook / Instagram) reklamlarının müşteri bazında harcama ve performans özeti.
        </p>
      </div>

      {connected && manager && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
          <p className="text-xs text-(--color-text-muted)">
            Kampanya kur, iyi giden kampanyayı tek tıkla kopyala, bütçe / bitiş tarihini değiştir, yayına al ya da durdur.
            {composerAccounts.length === 0 && " (Kampanya yönetilebilecek reklam hesabı yok: Meta'da sistem kullanıcısına \"Kampanyaları yönet\" yetkisi verilmeli.)"}
          </p>
          {composerAccounts.length > 0 && (
            <CampaignComposer accounts={composerAccounts} defaultClientId={clientId === "all" ? undefined : clientId} />
          )}
        </div>
      )}

      <AdsToolbar
        range={range}
        clientId={clientId}
        clients={clients}
        canSync={admin && connected}
        lastSync={lastSync ? lastSync.toISOString() : null}
      />

      {!connected && !admin && (
        <div className="rounded-xl border border-dashed border-(--color-border) p-8 text-center text-sm text-(--color-text-muted)">
          Reklam verileri henüz bağlanmadı. Bağlantıyı bir yönetici kuracak.
        </div>
      )}

      {connected && (
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
              sub={
                totals.results > 0
                  ? `Sonuç başı ${money(costPerResult(totals))}`
                  : "Mesaj, form, satın alma"
              }
            />
          </div>
          {totals.clicks > 0 && (
            <p className="-mt-3 text-xs text-(--color-text-muted)">
              Tıklama başı maliyet: {money(cpc(totals))}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <BarChart title="Günlük harcama" points={series} valueKey="spend" barClass="bg-brand-500" money />
            <BarChart title="Günlük tıklama" points={series} valueKey="clicks" barClass="bg-sky-500" />
            <BarChart title="Günlük sonuç" points={series} valueKey="results" barClass="bg-emerald-500" />
          </div>

          {clientId === "all" && clientBars.length > 0 && (
            <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
              <h2 className="mb-3 text-sm font-bold">Müşteri bazında harcama</h2>
              <ul className="space-y-2.5">
                {clientBars.map(([name, value]) => (
                  <li key={name}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{name}</span>
                      <span className="shrink-0 tabular-nums">
                        {money(value)}
                        {totals.spend > 0 && (
                          <span className="ml-1.5 text-xs text-(--color-text-muted)">
                            %{Math.round((value / totals.spend) * 100)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--color-surface-muted)">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(value / maxClient) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CampaignTable
            title="Aktif kampanyalar"
            hint="Harcama ve sonuçlar seçili tarih aralığına aittir."
            rows={active}
            showBudget
            showActions
            emptyText="Şu an yayında kampanya yok."
          />
          {pendingRows.length > 0 && (
            <CampaignTable
              title="Bekleyen kampanyalar"
              hint="Duraklatılmış, incelemede ya da henüz harcaması olmayan yeni kampanyalar."
              rows={pendingRows}
              showBudget
              showActions
              emptyText=""
            />
          )}
          <CampaignTable
            title="Geçmiş kampanyalar"
            hint="Seçili aralıkta harcaması olan, yayında olmayan kampanyalar. İyi gideni kopyalayarak yeniden başlatabilirsin."
            rows={past}
            showActions
            emptyText="Bu aralıkta geçmiş kampanya harcaması yok. Tarih aralığını genişletmeyi dene."
          />
        </>
      )}

      {googleStatus.connected && (
        <section className="space-y-4">
          <h2 className="text-base font-bold">Google Ads</h2>
          {googleAccounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-text-muted)">
              Google Ads hesabı yok. Yönetici hesabın altındaki hesaplar &ldquo;Şimdi güncelle&rdquo; ile gelir.
            </div>
          ) : (
            <GoogleAdsReport
              accountIds={googleAccounts.map((a) => a.id)}
              clientNameOf={googleClientOf}
              since={since}
              until={until}
              emptyText="Seçili tarih aralığında yayında Google reklamı yok."
            />
          )}
        </section>
      )}

      {admin && <AdsSetup connected={connected} accounts={setupAccounts} clients={clients} />}
      {admin && (
        <GoogleAdsSetup
          hasOAuth={googleStatus.hasOAuth}
          connected={googleStatus.connected}
          managerId={googleStatus.managerId}
          redirectUri={GOOGLE_REDIRECT_URI}
          clients={clients}
          accounts={googleAccountsRaw.map((a) => ({
            id: a.id,
            customerId: a.customerId,
            name: a.name,
            status: a.status,
            currency: a.currency,
            clientId: a.clientId,
          }))}
          flash={googleFlash ? { ok: googleFlash === "ok", text: mesaj ?? "" } : null}
        />
      )}
    </div>
  );
}
