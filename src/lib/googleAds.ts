import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { guessClientId } from "@/lib/adsSync";

// Google Ads API sürümü ortamdan değiştirilebilir (Google eski sürümleri belli aralıklarla kapatır).
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? "v25";
const SCOPE = "https://www.googleapis.com/auth/adwords";
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_ADS_REDIRECT_URI ?? "https://sistem.2keyidea.com/api/google-ads/callback";

const K_OAUTH = "google_oauth"; // şifreli JSON {clientId, clientSecret}
const K_REFRESH = "google_ads_refresh_token"; // şifreli
const K_MANAGER = "google_ads_manager_id"; // düz metin, tiresiz müşteri numarası

export class GoogleAdsError extends Error {}

const getSetting = async (key: string) => (await prisma.integrationSetting.findUnique({ where: { key } }))?.value ?? null;
const putSetting = (key: string, value: string) =>
  prisma.integrationSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

export const digits = (s: string) => s.replace(/\D/g, "");

export async function saveGoogleOAuthConfig(clientId: string, clientSecret: string, managerId: string) {
  await putSetting(K_OAUTH, encryptSecret(JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })));
  await putSetting(K_MANAGER, digits(managerId));
}

export async function getGoogleOAuthConfig(): Promise<{ clientId: string; clientSecret: string } | null> {
  const v = await getSetting(K_OAUTH);
  return v ? (JSON.parse(decryptSecret(v)) as { clientId: string; clientSecret: string }) : null;
}

export async function getManagerId() {
  return getSetting(K_MANAGER);
}

export async function getGoogleStatus() {
  const [oauth, refresh, manager] = await Promise.all([getSetting(K_OAUTH), getSetting(K_REFRESH), getSetting(K_MANAGER)]);
  return { hasOAuth: !!oauth, connected: !!refresh, managerId: manager };
}

export async function clearGoogleConnection() {
  await prisma.integrationSetting.deleteMany({ where: { key: { in: [K_REFRESH] } } });
}

export async function buildAuthUrl(state: string) {
  const cfg = await getGoogleOAuthConfig();
  if (!cfg) throw new GoogleAdsError("Önce OAuth istemci bilgilerini kaydedin.");
  const qs = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`;
}

async function tokenRequest(params: Record<string, string>) {
  const cfg = await getGoogleOAuthConfig();
  if (!cfg) throw new GoogleAdsError("OAuth istemci bilgileri tanımlı değil.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json) throw new GoogleAdsError(`Google yetkilendirmesi başarısız: ${json?.error_description ?? json?.error ?? res.status}`);
  return json;
}

/** Yetkilendirme kodunu yenileme anahtarına çevirip şifreli saklar. */
export async function exchangeCode(code: string) {
  const json = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: GOOGLE_REDIRECT_URI });
  if (!json.refresh_token) throw new GoogleAdsError("Google yenileme anahtarı vermedi. Yetkilendirmeyi tekrar deneyin.");
  await putSetting(K_REFRESH, encryptSecret(json.refresh_token));
  cached = null;
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const enc = await getSetting(K_REFRESH);
  if (!enc) throw new GoogleAdsError("Google Ads bağlı değil.");
  const json = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(enc) });
  if (!json.access_token) throw new GoogleAdsError("Google erişim anahtarı alınamadı.");
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

type Row = Record<string, Record<string, unknown>>;

/** GAQL sorgusu çalıştırır (salt okunur). */
async function gaql(customerId: string, managerId: string, query: string): Promise<Row[]> {
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "login-customer-id": managerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = Array.isArray(json) ? json[0]?.error : json?.error;
    const detail = err?.details?.[0]?.errors?.[0]?.message ?? err?.message ?? `HTTP ${res.status}`;
    throw new GoogleAdsError(`Google Ads: ${detail}`);
  }
  return (json as { results?: Row[] }[]).flatMap((b) => b.results ?? []);
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Yönetici hesabın altındaki müşteri hesaplarını, kampanyaları ve günlük performansı çekip veritabanına yazar. */
export async function syncGoogleAds(days = 40) {
  const manager = await getManagerId();
  if (!manager) throw new GoogleAdsError("Yönetici hesap numarası tanımlı değil.");

  const list = await gaql(
    manager,
    manager,
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.status FROM customer_client WHERE customer_client.manager = false"
  );

  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const until = isoDay(new Date());
  const since = isoDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  let campaignCount = 0;
  let insightCount = 0;

  for (const r of list) {
    const c = r.customerClient;
    const customerId = String(c.id);
    const name = String(c.descriptiveName ?? customerId);
    const account = await prisma.googleAdAccount.upsert({
      where: { customerId },
      create: {
        customerId,
        name,
        currency: (c.currencyCode as string) ?? null,
        timezone: (c.timeZone as string) ?? null,
        status: (c.status as string) ?? null,
        clientId: guessClientId(name, clients),
      },
      update: { name, currency: (c.currencyCode as string) ?? null, timezone: (c.timeZone as string) ?? null, status: (c.status as string) ?? null },
    });
    if (c.status !== "ENABLED") continue; // iptal/askıdaki hesapların verisi çekilmez

    const camps = await gaql(
      customerId,
      manager,
      "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign"
    );
    for (const row of camps) {
      const cp = row.campaign;
      const data = {
        adAccountId: account.id,
        name: String(cp.name),
        status: String(cp.status),
        channelType: (cp.advertisingChannelType as string) ?? null,
        dailyBudget: row.campaignBudget?.amountMicros != null ? num(row.campaignBudget.amountMicros) / 1_000_000 : null,
      };
      await prisma.googleAdCampaign.upsert({
        where: { campaignId: String(cp.id) },
        create: { campaignId: String(cp.id), ...data },
        update: data,
      });
    }
    campaignCount += camps.length;

    const stats = await gaql(
      customerId,
      manager,
      `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`
    );
    for (const row of stats) {
      const data = {
        campaignName: String(row.campaign.name),
        cost: num(row.metrics.costMicros) / 1_000_000,
        impressions: Math.round(num(row.metrics.impressions)),
        clicks: Math.round(num(row.metrics.clicks)),
        conversions: num(row.metrics.conversions),
      };
      const date = String(row.segments.date);
      await prisma.googleAdInsightDaily.upsert({
        where: { adAccountId_campaignId_date: { adAccountId: account.id, campaignId: String(row.campaign.id), date } },
        create: { adAccountId: account.id, campaignId: String(row.campaign.id), date, ...data },
        update: data,
      });
    }
    insightCount += stats.length;
    await prisma.googleAdAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date() } });
  }

  return { accounts: list.length, campaigns: campaignCount, insights: insightCount };
}

/** Zamanlayıcıdan çağrılır: bağlıysa son 40 günü yeniler, hata verirse sessizce loglar. */
export async function syncGoogleAdsIfConfigured() {
  try {
    const s = await getGoogleStatus();
    if (!s.connected || !s.managerId) return;
    await syncGoogleAds(40);
  } catch (err) {
    console.error("Google Ads verileri senkronize edilemedi:", err);
  }
}
