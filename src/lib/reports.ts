import { prisma } from "@/lib/prisma";
import { MONTHS } from "@/lib/format";

// Rapor sayfasının veri hesapları: ajans geneli (iş kalemi üretimi) ve müşteri bazlı aylık rapor.
// "İş kalemi" = tamamlanan iş (Task). Müşterinin "Revize:" kartları ayrı iş sayılmaz, revize olarak sayılır.

export type WorkType = "DESIGN" | "VIDEO" | "OTHER";
export const WORK_TYPE_LABEL: Record<WorkType, string> = { DESIGN: "Tasarım", VIDEO: "Video", OTHER: "Diğer" };

const VIDEO_RE = /\.(mp4|mov|webm|m4v|avi|mkv)$/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|psd|ai|svg|tiff?|heic)$/i;

/** İşin türü: teslim dosyalarına bakar (video varsa Video, görsel varsa Tasarım); dosya yoksa içerik tablosundaki türe. */
export function workTypeOf(fileNames: string[], contentType: string | null): WorkType {
  if (fileNames.some((n) => VIDEO_RE.test(n))) return "VIDEO";
  if (fileNames.some((n) => IMAGE_RE.test(n))) return "DESIGN";
  if (contentType === "REELS" || contentType === "HORIZONTAL_VIDEO") return "VIDEO";
  if (contentType === "STATIC" || contentType === "CAROUSEL" || contentType === "STORY") return "DESIGN";
  return "OTHER";
}

/** Türkiye saati (UTC+3): ayın başı ve sonu. */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
export function monthBounds(year: number, month: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - TR_OFFSET_MS),
    to: new Date(Date.UTC(year, month, 1) - TR_OFFSET_MS),
  };
}
export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
const pad = (n: number) => String(n).padStart(2, "0");
const isoMonthStart = (y: number, m: number) => `${y}-${pad(m)}-01`;
const isoMonthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
const trDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);

const notRevisionCard = [{ request: { is: null } }, { request: { is: { kind: { not: "REVISION" } } } }];

// ---------------------------------------------------------------------------------------------
// Ajans raporu
// ---------------------------------------------------------------------------------------------

type Tally = { done: number; design: number; video: number; other: number };
const emptyTally = (): Tally => ({ done: 0, design: 0, video: 0, other: 0 });
function bump(t: Tally, type: WorkType) {
  t.done += 1;
  if (type === "DESIGN") t.design += 1;
  else if (type === "VIDEO") t.video += 1;
  else t.other += 1;
}

export type AgencyReport = {
  label: string;
  /** revisions = müşteri revizesi, internalRevisions = yönetici (ekip içi) revizesi. */
  totals: Tally & { revisions: number; internalRevisions: number; revisionRate: number | null; internalRate: number | null; activeNow: number; clients: number };
  byClient: (Tally & { clientId: string | null; name: string; revisions: number; internalRevisions: number; revisionRate: number | null; internalRate: number | null })[];
  /** revised = bu dönemde yönetici revizesi alan iş sayısı (çalışanın işine verilen revize). */
  byEmployee: (Tally & { userId: string | null; name: string; revised: number; topClients: { name: string; count: number }[] })[];
  trend: { label: string; value: number }[];
};

const rate = (rev: number, done: number) => (done > 0 ? rev / done : null);

export async function buildAgencyReport(from: Date, to: Date, label: string): Promise<AgencyReport> {
  const tasks = await prisma.task.findMany({
    where: { status: "DONE", completedAt: { gte: from, lt: to }, OR: notRevisionCard },
    select: {
      id: true,
      client: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, fullName: true } },
      submissions: { select: { fileName: true } },
    },
  });
  const [contentRows, revisions, activeNow, internal] = await Promise.all([
    prisma.contentItem.findMany({ where: { taskId: { in: tasks.map((t) => t.id) } }, select: { taskId: true, contentType: true } }),
    prisma.clientRequest.findMany({ where: { kind: "REVISION", createdAt: { gte: from, lt: to } }, select: { clientId: true } }),
    prisma.task.count({ where: { status: { not: "DONE" }, OR: notRevisionCard } }),
    prisma.taskRevision.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { task: { select: { clientId: true, client: { select: { name: true } }, assignedToId: true, assignedTo: { select: { fullName: true } } } } },
    }),
  ]);
  const contentTypeOf = new Map(contentRows.map((c) => [c.taskId, c.contentType]));

  const totals = emptyTally();
  const clients = new Map<string, Tally & { name: string }>();
  const people = new Map<string, Tally & { name: string; perClient: Map<string, number> }>();
  for (const t of tasks) {
    const type = workTypeOf(t.submissions.map((s) => s.fileName), contentTypeOf.get(t.id) ?? null);
    bump(totals, type);

    const ck = t.client?.id ?? "none";
    if (!clients.has(ck)) clients.set(ck, { ...emptyTally(), name: t.client?.name ?? "Müşterisiz" });
    bump(clients.get(ck)!, type);

    const pk = t.assignedTo?.id ?? "none";
    if (!people.has(pk)) people.set(pk, { ...emptyTally(), name: t.assignedTo?.fullName ?? "Atanmamış (yönetici tamamladı)", perClient: new Map() });
    const p = people.get(pk)!;
    bump(p, type);
    const cname = t.client?.name ?? "Müşterisiz";
    p.perClient.set(cname, (p.perClient.get(cname) ?? 0) + 1);
  }

  const revByClient = new Map<string, number>();
  for (const r of revisions) revByClient.set(r.clientId, (revByClient.get(r.clientId) ?? 0) + 1);
  // Yönetici revizeleri: müşteri ve çalışan bazında.
  const intByClient = new Map<string, number>();
  const intByUser = new Map<string, { name: string; count: number }>();
  for (const r of internal) {
    const ck = r.task.clientId ?? "none";
    intByClient.set(ck, (intByClient.get(ck) ?? 0) + 1);
    if (!clients.has(ck)) clients.set(ck, { ...emptyTally(), name: r.task.client?.name ?? "Müşterisiz" });
    const uk = r.task.assignedToId ?? "none";
    const u = intByUser.get(uk) ?? { name: r.task.assignedTo?.fullName ?? "Atanmamış (yönetici tamamladı)", count: 0 };
    u.count += 1;
    intByUser.set(uk, u);
    if (!people.has(uk)) people.set(uk, { ...emptyTally(), name: u.name, perClient: new Map() });
  }
  // Revize alıp bu dönemde iş çıkmamış müşteriler de listede görünsün.
  const missing = [...revByClient.keys()].filter((id) => !clients.has(id));
  if (missing.length > 0) {
    const rows = await prisma.client.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } });
    for (const c of rows) clients.set(c.id, { ...emptyTally(), name: c.name });
  }

  const byClient = [...clients.entries()]
    .map(([id, t]) => {
      const revs = revByClient.get(id) ?? 0;
      const ints = intByClient.get(id) ?? 0;
      return { clientId: id === "none" ? null : id, ...t, revisions: revs, internalRevisions: ints, revisionRate: rate(revs, t.done), internalRate: rate(ints, t.done) };
    })
    .sort((a, b) => b.done - a.done || b.revisions - a.revisions || a.name.localeCompare(b.name, "tr"));

  const byEmployee = [...people.entries()]
    .map(([id, p]) => ({
      userId: id === "none" ? null : id,
      name: p.name,
      done: p.done,
      design: p.design,
      video: p.video,
      other: p.other,
      revised: intByUser.get(id)?.count ?? 0,
      topClients: [...p.perClient.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3),
    }))
    .sort((a, b) => b.done - a.done);

  // Son 6 ay: tamamlanan iş kalemi sayısı.
  const now = new Date();
  const [ty, tm] = trDate(now).split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1 - (5 - i), 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  });
  const trendFrom = monthBounds(months[0].y, months[0].m).from;
  const trendTasks = await prisma.task.findMany({
    where: { status: "DONE", completedAt: { gte: trendFrom }, OR: notRevisionCard },
    select: { completedAt: true },
  });
  const trend = months.map(({ y, m }) => {
    const b = monthBounds(y, m);
    return {
      label: `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`,
      value: trendTasks.filter((t) => t.completedAt && t.completedAt >= b.from && t.completedAt < b.to).length,
    };
  });

  return {
    label,
    totals: { ...totals, revisions: revisions.length, internalRevisions: internal.length, revisionRate: rate(revisions.length, totals.done), internalRate: rate(internal.length, totals.done), activeNow, clients: byClient.filter((c) => c.done > 0).length },
    byClient,
    byEmployee,
    trend,
  };
}

// ---------------------------------------------------------------------------------------------
// Müşteri aylık raporu
// ---------------------------------------------------------------------------------------------

export type DayPoint = { date: string; a: number; b: number };

export type AdBlock = {
  platform: "Meta" | "Google";
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** Tıklama oranı (%). */
  ctr: number | null;
  cpc: number | null;
  /** Sonuç: Meta'da mesaj + potansiyel müşteri + satın alma, Google'da dönüşüm. */
  results: number;
  costPerResult: number | null;
  /** Meta sonuçlarının kırılımı (mesaj / form / satın alma). */
  breakdown: { messages: number; leads: number; purchases: number } | null;
  /** Günlük harcama (a) ve sonuç (b). */
  daily: DayPoint[];
  campaigns: { name: string; spend: number; clicks: number; results: number }[];
  /** Bir önceki ayın toplamları (karşılaştırma için); veri yoksa null. */
  prev: { spend: number; results: number; clicks: number } | null;
};

export type PostRow = {
  date: string;
  type: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  reach: number | null;
  views: number | null;
  likes: number;
  comments: number;
  saved: number | null;
  shares: number | null;
  /** Etkileşim oranı (%): (beğeni + yorum + kaydetme + paylaşım) / erişim. */
  rate: number | null;
};

export type ReportData = {
  v: 2;
  clientName: string;
  year: number;
  month: number;
  label: string;
  generatedAt: string;
  social: null | {
    igUsername: string | null;
    followersStart: number | null;
    followersEnd: number | null;
    change: number | null;
    /** Başlangıç sayısı ay içinden alındıysa (kayıt ay ortasında başlamış). */
    startFromMonth: boolean;
    reach: number;
    profileViews: number;
    interactions: number;
    views: number;
    engagedAccounts: number;
    prev: { reach: number; profileViews: number; interactions: number } | null;
    /** Günlük erişim (a) ve profil ziyareti (b). */
    daily: DayPoint[];
    postCount: number;
    posts: PostRow[];
  };
  meta: AdBlock | null;
  google: AdBlock | null;
  shares: { planned: number; published: number; stories: number; posts: number; items: { date: string; title: string; kind: string; published: boolean }[] };
  /** Çalışma özeti (kısa). */
  work: { total: number; design: number; video: number; other: number; revisions: number; approvals: number };
};

const shortTitle = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);
const div = (a: number, b: number) => (b > 0 ? a / b : null);

const postType = (product: string | null, mediaType: string) =>
  product === "REELS" ? "Reels" : mediaType === "CAROUSEL_ALBUM" ? "Kaydırmalı" : mediaType === "VIDEO" ? "Video" : "Gönderi";

function prevMonthOf(year: number, month: number) {
  return month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
}

/** Meta reklam: seçilen ayın toplamı, günlük seri ve kampanyalar. */
async function metaBlock(accountIds: string[], currency: string, year: number, month: number): Promise<AdBlock | null> {
  const load = (y: number, m: number) =>
    prisma.adInsightDaily.findMany({
      where: { adAccountId: { in: accountIds }, date: { gte: isoMonthStart(y, m), lte: isoMonthEnd(y, m) } },
      select: { date: true, campaignMetaId: true, campaignName: true, spend: true, impressions: true, clicks: true, messages: true, leads: true, purchases: true },
    });
  const [rows, prevRows] = await Promise.all([load(year, month), (async () => { const p = prevMonthOf(year, month); return load(p.y, p.m); })()]);
  if (rows.length === 0) return null;

  let spend = 0, impressions = 0, clicks = 0, messages = 0, leads = 0, purchases = 0;
  const days = new Map<string, DayPoint>();
  const camps = new Map<string, { name: string; spend: number; clicks: number; results: number }>();
  for (const r of rows) {
    const res = r.messages + r.leads + r.purchases;
    spend += Number(r.spend);
    impressions += r.impressions;
    clicks += r.clicks;
    messages += r.messages;
    leads += r.leads;
    purchases += r.purchases;
    const d = days.get(r.date) ?? { date: r.date, a: 0, b: 0 };
    d.a += Number(r.spend);
    d.b += res;
    days.set(r.date, d);
    const c = camps.get(r.campaignMetaId) ?? { name: r.campaignName, spend: 0, clicks: 0, results: 0 };
    c.spend += Number(r.spend);
    c.clicks += r.clicks;
    c.results += res;
    camps.set(r.campaignMetaId, c);
  }
  const results = messages + leads + purchases;
  const prev =
    prevRows.length > 0
      ? {
          spend: prevRows.reduce((s, r) => s + Number(r.spend), 0),
          results: prevRows.reduce((s, r) => s + r.messages + r.leads + r.purchases, 0),
          clicks: prevRows.reduce((s, r) => s + r.clicks, 0),
        }
      : null;
  return {
    platform: "Meta",
    currency,
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: div(spend, clicks),
    results,
    costPerResult: div(spend, results),
    breakdown: { messages, leads, purchases },
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    campaigns: [...camps.values()].sort((a, b) => b.spend - a.spend).slice(0, 8),
    prev,
  };
}

/** Google Ads: seçilen ayın toplamı (dönüşümler "sonuç" sayılır). */
async function googleBlock(accountIds: string[], currency: string, year: number, month: number): Promise<AdBlock | null> {
  const load = (y: number, m: number) =>
    prisma.googleAdInsightDaily.findMany({
      where: { adAccountId: { in: accountIds }, date: { gte: isoMonthStart(y, m), lte: isoMonthEnd(y, m) } },
      select: { date: true, campaignId: true, campaignName: true, cost: true, impressions: true, clicks: true, conversions: true },
    });
  const p0 = prevMonthOf(year, month);
  const [rows, prevRows] = await Promise.all([load(year, month), load(p0.y, p0.m)]);
  if (rows.length === 0) return null;

  let spend = 0, impressions = 0, clicks = 0, results = 0;
  const days = new Map<string, DayPoint>();
  const camps = new Map<string, { name: string; spend: number; clicks: number; results: number }>();
  for (const r of rows) {
    const conv = Number(r.conversions);
    spend += Number(r.cost);
    impressions += r.impressions;
    clicks += r.clicks;
    results += conv;
    const d = days.get(r.date) ?? { date: r.date, a: 0, b: 0 };
    d.a += Number(r.cost);
    d.b += conv;
    days.set(r.date, d);
    const c = camps.get(r.campaignId) ?? { name: r.campaignName, spend: 0, clicks: 0, results: 0 };
    c.spend += Number(r.cost);
    c.clicks += r.clicks;
    c.results += conv;
    camps.set(r.campaignId, c);
  }
  results = Math.round(results);
  const prev =
    prevRows.length > 0
      ? {
          spend: prevRows.reduce((s, r) => s + Number(r.cost), 0),
          results: Math.round(prevRows.reduce((s, r) => s + Number(r.conversions), 0)),
          clicks: prevRows.reduce((s, r) => s + r.clicks, 0),
        }
      : null;
  return {
    platform: "Google",
    currency,
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: div(spend, clicks),
    results,
    costPerResult: div(spend, results),
    breakdown: null,
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    campaigns: [...camps.values()].map((c) => ({ ...c, results: Math.round(c.results) })).sort((a, b) => b.spend - a.spend).slice(0, 8),
    prev,
  };
}

/** Müşteri için seçilen ayın raporu. Müşteriyi ilgilendiren veriler: Instagram gelişimi ve içerik etkileşimi, reklam harcaması ve dönüşümler,
 * paylaşılan içerikler; yapılan işler sadece kısa özet olarak girer. Reklam verisi ilgili reklam yönetimi hizmeti (Meta / Google) işaretli
 * müşterilerde, sosyal medya verisi ise "Gelişim" sayfası müşteriye açık hesapta rapora girer (müşterinin panelde göreceği veriyle aynı kural). */
export async function buildClientReport(clientId: string, year: number, month: number): Promise<ReportData> {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { name: true, metaAdsManaged: true, googleAdsManaged: true },
  });
  const { from, to } = monthBounds(year, month);
  const d1 = isoMonthStart(year, month);
  const d2 = isoMonthEnd(year, month);

  const [tasks, revisionCount, itemApprovals, requestApprovals, posts, metaAccounts, googleAccounts, social] = await Promise.all([
    prisma.task.findMany({
      where: { clientId, status: "DONE", completedAt: { gte: from, lt: to }, OR: notRevisionCard },
      select: { id: true, submissions: { select: { fileName: true } } },
    }),
    prisma.clientRequest.count({ where: { clientId, kind: "REVISION", createdAt: { gte: from, lt: to } } }),
    prisma.contentItem.count({ where: { clientId, deliveryStatus: "APPROVED", reviewedAt: { gte: from, lt: to } } }),
    prisma.clientRequest.count({ where: { clientId, deliveryStatus: "APPROVED", reviewedAt: { gte: from, lt: to } } }),
    prisma.sharePost.findMany({
      where: { clientId, date: { gte: d1, lte: d2 } },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      select: { date: true, title: true, text: true, kind: true, publishedAt: true },
    }),
    client.metaAdsManaged ? prisma.adAccount.findMany({ where: { clientId }, select: { id: true, currency: true } }) : Promise.resolve([]),
    client.googleAdsManaged ? prisma.googleAdAccount.findMany({ where: { clientId }, select: { id: true, currency: true } }) : Promise.resolve([]),
    prisma.socialAccount.findFirst({ where: { clientId, visibleToClient: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const contentRows = await prisma.contentItem.findMany({ where: { taskId: { in: tasks.map((t) => t.id) } }, select: { taskId: true, contentType: true } });
  const contentTypeOf = new Map(contentRows.map((c) => [c.taskId, c.contentType]));
  const types = tasks.map((t) => workTypeOf(t.submissions.map((s) => s.fileName), contentTypeOf.get(t.id) ?? null));

  const [meta, google] = await Promise.all([
    metaAccounts.length > 0 ? metaBlock(metaAccounts.map((a) => a.id), metaAccounts[0].currency ?? "TRY", year, month) : Promise.resolve(null),
    googleAccounts.length > 0 ? googleBlock(googleAccounts.map((a) => a.id), googleAccounts[0].currency ?? "TRY", year, month) : Promise.resolve(null),
  ]);

  // Sosyal medya
  let socialData: ReportData["social"] = null;
  if (social) {
    const p0 = prevMonthOf(year, month);
    const [days, before, prevDays, mediaAll, postCount] = await Promise.all([
      prisma.socialDaily.findMany({ where: { accountId: social.id, date: { gte: d1, lte: d2 } }, orderBy: { date: "asc" } }),
      prisma.socialDaily.findFirst({ where: { accountId: social.id, date: { lt: d1 }, igFollowers: { not: null } }, orderBy: { date: "desc" } }),
      prisma.socialDaily.findMany({
        where: { accountId: social.id, date: { gte: isoMonthStart(p0.y, p0.m), lte: isoMonthEnd(p0.y, p0.m) }, reach: { not: null } },
        select: { reach: true, profileViews: true, totalInteractions: true },
      }),
      prisma.socialMedia.findMany({ where: { accountId: social.id, postedAt: { gte: from, lt: to } }, orderBy: { postedAt: "desc" } }),
      prisma.socialMedia.count({ where: { accountId: social.id, postedAt: { gte: from, lt: to } } }),
    ]);
    const withF = days.filter((d) => d.igFollowers !== null);
    const startRow = before ?? withF[0] ?? null;
    const endRow = withF.length ? withF[withF.length - 1] : null;
    const start = startRow?.igFollowers ?? null;
    const end = endRow?.igFollowers ?? null;
    const sum = (f: (d: (typeof days)[number]) => number | null) => days.reduce((s, d) => s + (f(d) ?? 0), 0);

    if (days.length > 0 || mediaAll.length > 0) {
      const rows: PostRow[] = mediaAll.map((m) => {
        const inter = m.likes + m.comments + (m.saved ?? 0) + (m.shares ?? 0);
        return {
          date: trDate(m.postedAt),
          type: postType(m.product, m.mediaType),
          caption: m.caption ? shortTitle(m.caption) : null,
          permalink: m.permalink,
          thumbnailUrl: m.thumbnailUrl,
          reach: m.reach,
          views: m.views,
          likes: m.likes,
          comments: m.comments,
          saved: m.saved,
          shares: m.shares,
          rate: m.reach ? (inter / m.reach) * 100 : null,
        };
      });
      socialData = {
        igUsername: social.igUsername,
        followersStart: start,
        followersEnd: end,
        change: start !== null && end !== null && startRow !== endRow ? end - start : null,
        startFromMonth: !before,
        reach: sum((d) => d.reach),
        profileViews: sum((d) => d.profileViews),
        interactions: sum((d) => d.totalInteractions),
        views: sum((d) => d.views),
        engagedAccounts: sum((d) => d.accountsEngaged),
        prev:
          prevDays.length > 0
            ? {
                reach: prevDays.reduce((s, d) => s + (d.reach ?? 0), 0),
                profileViews: prevDays.reduce((s, d) => s + (d.profileViews ?? 0), 0),
                interactions: prevDays.reduce((s, d) => s + (d.totalInteractions ?? 0), 0),
              }
            : null,
        daily: days.filter((d) => d.reach !== null).map((d) => ({ date: d.date, a: d.reach ?? 0, b: d.profileViews ?? 0 })),
        postCount,
        // En çok erişen 10 gönderi (erişimi bilinmeyenler sonda).
        posts: rows.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1)).slice(0, 10),
      };
    }
  }

  return {
    v: 2,
    clientName: client.name,
    year,
    month,
    label: monthLabel(year, month),
    generatedAt: new Date().toISOString(),
    social: socialData,
    meta,
    google,
    shares: {
      planned: posts.length,
      published: posts.filter((p) => p.publishedAt).length,
      stories: posts.filter((p) => p.kind === "STORY").length,
      posts: posts.filter((p) => p.kind !== "STORY").length,
      items: posts.map((p) => ({ date: p.date, title: shortTitle(p.title || p.text?.split("\n")[0] || "Paylaşım"), kind: p.kind, published: !!p.publishedAt })),
    },
    work: {
      total: tasks.length,
      design: types.filter((t) => t === "DESIGN").length,
      video: types.filter((t) => t === "VIDEO").length,
      other: types.filter((t) => t === "OTHER").length,
      revisions: revisionCount,
      approvals: itemApprovals + requestApprovals,
    },
  };
}
