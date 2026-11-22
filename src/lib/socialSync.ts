import { prisma } from "@/lib/prisma";
import { MetaError, getMetaToken, graphGet, graphGetAll } from "@/lib/meta";
import { guessClientId } from "@/lib/adsSync";

// Sosyal Medya: Meta'dan Facebook sayfası + Instagram hesabı verilerini çekip günlük kaydeder.
// Takipçi geçmişini Meta uzun süre vermediği için her gün kendimiz kaydederek biriktiriyoruz.

type MetaPage = {
  id: string;
  name: string;
  followers_count?: number;
  fan_count?: number;
  instagram_business_account?: { id: string; username?: string; followers_count?: number; media_count?: number };
};

type InsightValue = { name: string; total_value?: { value: number }; values?: { value: number; end_time: string }[] };
type InsightResp = { data: InsightValue[] };

type MetaMedia = {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
const unix = (iso: string) => String(Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000));
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

/** total_value tipi ölçümleri tek günlük aralık için okur (ör. reach, profile_views). */
async function dayInsights(igId: string, day: string, token: string) {
  const base = { period: "day", metric_type: "total_value", since: unix(day), until: unix(addDays(day, 1)) };
  const read = (r: InsightResp) => Object.fromEntries(r.data.map((m) => [m.name, m.total_value?.value ?? 0])) as Record<string, number>;
  try {
    return read(await graphGet<InsightResp>(`${igId}/insights`, { ...base, metric: "reach,profile_views,accounts_engaged,total_interactions,views" }, token));
  } catch {
    // Bazı hesaplarda "views" desteklenmeyebilir; çekirdek ölçümlerle tekrar dene.
    return read(await graphGet<InsightResp>(`${igId}/insights`, { ...base, metric: "reach,profile_views,accounts_engaged,total_interactions" }, token));
  }
}

async function mediaInsights(mediaId: string, product: string | undefined, token: string) {
  const attempts = [
    "reach,views,saved,shares,total_interactions",
    "reach,saved,shares,total_interactions",
    "reach,saved",
  ];
  for (const metric of attempts) {
    try {
      const r = await graphGet<InsightResp>(`${mediaId}/insights`, { metric }, token);
      return Object.fromEntries(r.data.map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? 0])) as Record<string, number>;
    } catch {
      /* sıradaki ölçüm kümesini dene */
    }
  }
  void product;
  return {} as Record<string, number>;
}

/** Tek hesabı eşitler: bugünkü takipçi sayısı, son günlerin performansı, son gönderiler. */
async function syncAccount(account: { id: string; igId: string | null }, page: MetaPage, token: string, backfillDays: number) {
  const today = todayIso();
  const ig = page.instagram_business_account;

  // 1) Bugünkü takipçi anlık görüntüsü (geçmiş kalıcı olarak böyle birikir).
  await prisma.socialDaily.upsert({
    where: { accountId_date: { accountId: account.id, date: today } },
    create: {
      accountId: account.id,
      date: today,
      igFollowers: ig?.followers_count ?? null,
      fbFollowers: page.followers_count ?? page.fan_count ?? null,
    },
    update: { igFollowers: ig?.followers_count ?? null, fbFollowers: page.followers_count ?? page.fan_count ?? null },
  });
  if (!ig) return;

  // 2) Günlük performans: eksik günler + son 3 gün (Meta rakamları sonradan netleştirir).
  const existing = await prisma.socialDaily.findMany({
    where: { accountId: account.id, date: { gte: addDays(today, -backfillDays) } },
    select: { date: true, reach: true },
  });
  const have = new Map(existing.map((r) => [r.date, r.reach]));
  for (let i = backfillDays; i >= 0; i--) {
    const day = addDays(today, -i);
    if (have.get(day) != null && i > 2) continue;
    let m: Record<string, number>;
    try {
      m = await dayInsights(ig.id, day, token);
    } catch {
      continue;
    }
    const data = {
      reach: m.reach ?? 0,
      profileViews: m.profile_views ?? 0,
      accountsEngaged: m.accounts_engaged ?? 0,
      totalInteractions: m.total_interactions ?? 0,
      views: m.views ?? null,
    };
    await prisma.socialDaily.upsert({
      where: { accountId_date: { accountId: account.id, date: day } },
      create: { accountId: account.id, date: day, ...data },
      update: data,
    });
  }

  // 3) Instagram'ın günlük net takipçi değişimi (100+ takipçide gelir; yoksa sessizce geçilir).
  try {
    const fc = await graphGet<InsightResp>(
      `${ig.id}/insights`,
      { metric: "follower_count", period: "day", since: unix(addDays(today, -29)), until: unix(addDays(today, 1)) },
      token
    );
    for (const v of fc.data[0]?.values ?? []) {
      // end_time ertesi günün başlangıcıdır; değer bir önceki günün değişimidir.
      const day = addDays(v.end_time.slice(0, 10), -1);
      await prisma.socialDaily.upsert({
        where: { accountId_date: { accountId: account.id, date: day } },
        create: { accountId: account.id, date: day, followerDelta: v.value },
        update: { followerDelta: v.value },
      });
    }
  } catch {
    /* 100 takipçiden azsa Meta bu ölçümü vermez */
  }

  // 4) Son gönderiler ve sonuçları.
  const media = await graphGetAll<MetaMedia>(
    `${ig.id}/media`,
    { fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count", limit: "30" },
    token,
    1
  );
  for (const m of media) {
    const ins = await mediaInsights(m.id, m.media_product_type, token);
    const data = {
      accountId: account.id,
      caption: m.caption ?? null,
      mediaType: m.media_type,
      product: m.media_product_type ?? null,
      permalink: m.permalink ?? null,
      thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
      postedAt: new Date(m.timestamp),
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      reach: ins.reach ?? null,
      views: ins.views ?? null,
      saved: ins.saved ?? null,
      shares: ins.shares ?? null,
    };
    await prisma.socialMedia.upsert({ where: { igMediaId: m.id }, create: { igMediaId: m.id, ...data }, update: data });
  }
}

/** Sistem kullanıcısının gördüğü tüm sayfaları (ve bağlı Instagram hesaplarını) eşitler.
 * `onlyStale`: son eşitlemesi bu kadar saatten eskileri yeniler (otomatik çalışmada 6 saat). */
export async function syncSocial(opts: { backfillDays?: number; staleHours?: number } = {}) {
  const token = await getMetaToken();
  if (!token) throw new MetaError("Meta erişim anahtarı tanımlı değil.");
  const backfillDays = opts.backfillDays ?? 30;

  const pages = await graphGetAll<MetaPage>(
    "me/accounts",
    { fields: "id,name,followers_count,fan_count,instagram_business_account{id,username,followers_count,media_count}" },
    token,
    5
  );
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });

  let done = 0;
  const errors: string[] = [];
  for (const page of pages) {
    const ig = page.instagram_business_account;
    const account = await prisma.socialAccount.upsert({
      where: { pageId: page.id },
      create: {
        pageId: page.id,
        pageName: page.name,
        igId: ig?.id ?? null,
        igUsername: ig?.username ?? null,
        clientId: guessClientId(page.name, clients) ?? guessClientId(ig?.username ?? "", clients),
      },
      update: { pageName: page.name, igId: ig?.id ?? null, igUsername: ig?.username ?? null },
    });
    if (opts.staleHours && account.lastSyncAt && Date.now() - account.lastSyncAt.getTime() < opts.staleHours * 3600 * 1000) continue;
    try {
      await syncAccount(account, page, token, backfillDays);
      await prisma.socialAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date(), lastError: null } });
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      errors.push(`${page.name}: ${msg}`);
      await prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: msg.slice(0, 500) } });
    }
  }
  return { accounts: pages.length, synced: done, errors };
}

/** Arka plan: anahtar tanımlıysa (ve yetkiler yetiyorsa) eskiyen hesapları yeniler. */
export async function syncSocialIfConfigured() {
  try {
    if (!(await getMetaToken())) return;
    await syncSocial({ staleHours: 6 });
  } catch (e) {
    console.error("Sosyal medya verileri çekilemedi:", e instanceof Error ? e.message : e);
  }
}
