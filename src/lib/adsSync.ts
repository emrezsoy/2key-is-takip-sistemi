import { prisma } from "@/lib/prisma";
import { MetaError, getMetaToken, graphGetAll } from "@/lib/meta";

type MetaAccount = {
  account_id: string;
  name: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  user_tasks?: string[];
};

/** Sistem kullanıcısı bu hesapta kampanya kurup yönetebiliyor mu. */
export const canManageTasks = (tasks: string[] | undefined) =>
  !!tasks && (tasks.includes("MANAGE") || tasks.includes("ADVERTISE"));

type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective?: string;
  daily_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
};

export const CAMPAIGN_FIELDS = "id,name,status,effective_status,objective,daily_budget,start_time,stop_time,created_time";

/** Meta kampanyasını veritabanı satırına çevirir. */
export function campaignData(adAccountId: string, c: MetaCampaign) {
  return {
    adAccountId,
    name: c.name,
    status: c.status,
    effectiveStatus: c.effective_status,
    objective: c.objective ?? null,
    // Meta bütçeyi para biriminin en küçük birimiyle (kuruş) verir.
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    startTime: c.start_time ? new Date(c.start_time) : null,
    stopTime: c.stop_time ? new Date(c.stop_time) : null,
    createdTime: c.created_time ? new Date(c.created_time) : null,
  };
}

/** Tek bir reklam hesabının kampanyalarını hemen yeniler (kampanya kurma / düzenleme sonrası). */
export async function syncAccountCampaigns(accountMetaId: string) {
  const token = await getMetaToken();
  if (!token) return;
  const account = await prisma.adAccount.findUnique({ where: { metaId: accountMetaId }, select: { id: true } });
  if (!account) return;
  const campaigns = await graphGetAll<MetaCampaign>(`act_${accountMetaId}/campaigns`, { fields: CAMPAIGN_FIELDS }, token);
  for (const c of campaigns) {
    const data = campaignData(account.id, c);
    await prisma.adCampaign.upsert({ where: { metaId: c.id }, create: { metaId: c.id, ...data }, update: data });
  }
}

type MetaAction = { action_type: string; value: string };

type MetaInsight = {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
};

const num = (v: string | undefined) => Number(v ?? 0) || 0;
const actionValue = (actions: MetaAction[] | undefined, ...types: string[]) =>
  Math.round(
    (actions ?? []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + num(a.value), 0)
  );

const normalize = (s: string) =>
  s
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "");

/** Yeni gelen reklam hesabını, adı müşteri adını içeriyorsa (ör. "Kent Yapı Cty Center" -> "Kent Yapı")
 * otomatik o müşteriye bağlar. Bulamazsa boş bırakır; admin elle seçer. */
export function guessClientId(accountName: string, clients: { id: string; name: string }[]) {
  const target = normalize(accountName);
  const hits = clients.filter((c) => {
    const n = normalize(c.name);
    return n.length >= 4 && target.includes(n);
  });
  // Birden çok eşleşmede en uzun (en belirgin) ad kazanır.
  hits.sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  return hits[0]?.id ?? null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Meta'dan reklam hesaplarını, kampanyaları ve günlük performansı çekip veritabanına yazar.
 * `days`: kaç günlük performans verisi yenilensin (ilk kurulumda 365). */
export async function syncAds(days = 40) {
  const token = await getMetaToken();
  if (!token) throw new MetaError("Meta erişim anahtarı tanımlı değil.");

  const accounts = await graphGetAll<MetaAccount>(
    "me/adaccounts",
    { fields: "account_id,name,account_status,currency,timezone_name,user_tasks" },
    token
  );

  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const until = isoDay(new Date());
  const since = isoDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  let campaignCount = 0;
  let insightCount = 0;

  for (const acc of accounts) {
    const account = await prisma.adAccount.upsert({
      where: { metaId: acc.account_id },
      create: {
        metaId: acc.account_id,
        name: acc.name,
        status: acc.account_status ?? null,
        currency: acc.currency ?? null,
        timezone: acc.timezone_name ?? null,
        canManage: canManageTasks(acc.user_tasks),
        clientId: guessClientId(acc.name, clients),
      },
      update: {
        name: acc.name,
        status: acc.account_status ?? null,
        currency: acc.currency ?? null,
        timezone: acc.timezone_name ?? null,
        canManage: canManageTasks(acc.user_tasks),
      },
    });

    const campaigns = await graphGetAll<MetaCampaign>(
      `act_${acc.account_id}/campaigns`,
      { fields: CAMPAIGN_FIELDS },
      token
    );
    for (const c of campaigns) {
      const data = campaignData(account.id, c);
      await prisma.adCampaign.upsert({
        where: { metaId: c.id },
        create: { metaId: c.id, ...data },
        update: data,
      });
    }
    campaignCount += campaigns.length;

    const insights = await graphGetAll<MetaInsight>(
      `act_${acc.account_id}/insights`,
      {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions",
      },
      token
    );
    for (const i of insights) {
      const data = {
        campaignName: i.campaign_name,
        spend: num(i.spend),
        impressions: Math.round(num(i.impressions)),
        reach: Math.round(num(i.reach)),
        clicks: Math.round(num(i.clicks)),
        linkClicks: Math.round(num(i.inline_link_clicks)),
        messages: actionValue(i.actions, "onsite_conversion.messaging_conversation_started_7d"),
        leads: actionValue(i.actions, "lead"),
        purchases: actionValue(i.actions, "purchase"),
      };
      await prisma.adInsightDaily.upsert({
        where: {
          adAccountId_campaignMetaId_date: {
            adAccountId: account.id,
            campaignMetaId: i.campaign_id,
            date: i.date_start,
          },
        },
        create: { adAccountId: account.id, campaignMetaId: i.campaign_id, date: i.date_start, ...data },
        update: data,
      });
    }
    insightCount += insights.length;

    await prisma.adAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date() } });
  }

  // Artık Meta'nın döndürmediği hesaplar (portföyden çıkarılmış / erişim kaldırılmış): kampanyaları güncellenemez, eski "Yayında" durumu
  // kalmasın diye "Bağlantı yok" olarak işaretlenir. Hesap geri gelirse bir sonraki eşitlemede asıl durum yazılır.
  const seen = accounts.map((a) => a.account_id);
  await prisma.adCampaign.updateMany({
    where: { adAccount: { metaId: { notIn: seen } }, effectiveStatus: { in: ["ACTIVE", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW"] } },
    data: { effectiveStatus: "DISCONNECTED" },
  });
  await prisma.adAccount.updateMany({ where: { metaId: { notIn: seen } }, data: { canManage: false } });

  return { accounts: accounts.length, campaigns: campaignCount, insights: insightCount };
}

/** Zamanlayıcıdan çağrılır: anahtar tanımlıysa son 40 günü yeniler, hata verirse sessizce loglar. */
export async function syncAdsIfConfigured() {
  try {
    if (!(await getMetaToken())) return;
    await syncAds(40);
  } catch (err) {
    console.error("Reklam verileri senkronize edilemedi:", err);
  }
}
