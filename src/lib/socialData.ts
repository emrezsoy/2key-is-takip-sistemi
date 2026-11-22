import { prisma } from "@/lib/prisma";

export const SOCIAL_RANGES = [
  { key: "7", label: "7 gün", days: 7 },
  { key: "30", label: "30 gün", days: 30 },
  { key: "90", label: "90 gün", days: 90 },
] as const;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

export type SocialPoint = {
  date: string;
  followers: number | null;
  reach: number | null;
  profileViews: number | null;
  engaged: number | null;
  interactions: number | null;
  views: number | null;
};

export type SocialMediaRow = {
  id: string;
  caption: string | null;
  mediaType: string;
  product: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: Date;
  likes: number;
  comments: number;
  reach: number | null;
  views: number | null;
  saved: number | null;
  shares: number | null;
};

export type SocialReportData = {
  account: { id: string; pageName: string; igUsername: string | null; lastSyncAt: Date | null; lastError: string | null; hasIg: boolean };
  from: string;
  to: string;
  points: SocialPoint[];
  followersNow: number | null;
  /** Dönem başına göre takipçi değişimi; kayıt dönemden kısaysa kayıt başlangıcından itibaren. */
  followerChange: number | null;
  /** Takipçi kaydının başladığı gün (dönemden kısa geçmiş varsa gösterilir). */
  historyStart: string | null;
  totals: { reach: number; profileViews: number; engaged: number; interactions: number; views: number; posts: number };
  media: SocialMediaRow[];
};

const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

export async function loadSocialReport(accountId: string, days: number): Promise<SocialReportData | null> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;
  const to = todayIso();
  const from = addDays(to, -(days - 1));

  const [rows, mediaRows, firstSnap] = await Promise.all([
    prisma.socialDaily.findMany({ where: { accountId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
    prisma.socialMedia.findMany({
      where: { accountId, postedAt: { gte: new Date(`${from}T00:00:00Z`) } },
      orderBy: { postedAt: "desc" },
      take: 30,
    }),
    prisma.socialDaily.findFirst({ where: { accountId, igFollowers: { not: null } }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const points: SocialPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDate.get(d);
    points.push({
      date: d,
      followers: r?.igFollowers ?? null,
      reach: r?.reach ?? null,
      profileViews: r?.profileViews ?? null,
      engaged: r?.accountsEngaged ?? null,
      interactions: r?.totalInteractions ?? null,
      views: r?.views ?? null,
    });
  }

  const withFollowers = points.filter((p) => p.followers !== null);
  const followersNow = withFollowers.length ? withFollowers[withFollowers.length - 1].followers : null;
  const followerChange =
    withFollowers.length >= 2 ? (withFollowers[withFollowers.length - 1].followers as number) - (withFollowers[0].followers as number) : null;
  const historyStart = firstSnap && firstSnap.date > from ? firstSnap.date : null;

  return {
    account: {
      id: account.id,
      pageName: account.pageName,
      igUsername: account.igUsername,
      lastSyncAt: account.lastSyncAt,
      lastError: account.lastError,
      hasIg: !!account.igId,
    },
    from,
    to,
    points,
    followersNow,
    followerChange,
    historyStart,
    totals: {
      reach: sum(points.map((p) => p.reach)),
      profileViews: sum(points.map((p) => p.profileViews)),
      engaged: sum(points.map((p) => p.engaged)),
      interactions: sum(points.map((p) => p.interactions)),
      views: sum(points.map((p) => p.views)),
      posts: mediaRows.length,
    },
    media: mediaRows.map((m) => ({
      id: m.id,
      caption: m.caption,
      mediaType: m.mediaType,
      product: m.product,
      permalink: m.permalink,
      thumbnailUrl: m.thumbnailUrl,
      postedAt: m.postedAt,
      likes: m.likes,
      comments: m.comments,
      reach: m.reach,
      views: m.views,
      saved: m.saved,
      shares: m.shares,
    })),
  };
}
