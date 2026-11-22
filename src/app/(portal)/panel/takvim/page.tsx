import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { SocialServiceNotice } from "@/components/portal/SocialServiceNotice";
import { ShareCalendar } from "@/components/share/ShareCalendar";
import { defaultClientColor } from "@/components/share/palette";
import type { SharePostRow } from "@/components/share/types";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export default async function PortalCalendar({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requirePortalUser();
  if (!user.socialManaged) return <SocialServiceNotice title="Paylaşım Takvimi" />;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const [ty, tm] = today.split("-").map(Number);
  const { year: yearParam, month: monthParam } = await searchParams;
  const year = Number(yearParam) || ty;
  const monthNum = Number(monthParam);
  const month = monthNum >= 1 && monthNum <= 12 ? monthNum : tm;

  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    return { date: toIso(d), inMonth: d.getUTCMonth() === month - 1 };
  });

  const posts = await prisma.sharePost.findMany({
    where: { clientId: user.clientId, date: { gte: days[0].date, lte: days[days.length - 1].date } },
    include: { images: { orderBy: { position: "asc" } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const color = defaultClientColor(0);
  const rows: SharePostRow[] = posts.map((p) => ({
    id: p.id,
    date: p.date,
    clientId: p.clientId,
    clientName: user.clientName,
    color,
    title: p.title,
    text: p.text,
    kind: p.kind,
    time: p.time,
    published: !!p.publishedAt,
    metaScheduled: false, // Meta planı müşteriye gösterilmez.
    metaStatus: null,
    metaError: null,
    metaAccess: "NO_ACCOUNT",
    igPermalink: null,
    cover: p.coverUrl ? { url: p.coverUrl, name: p.coverName } : null,
    images: p.images.map((i) => ({
      id: i.id,
      url: i.url,
      name: i.name,
      mediaType: i.mediaType === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const),
    })),
  }));

  return (
    <ShareCalendar
      year={year}
      month={month}
      today={today}
      days={days}
      posts={rows}
      clients={[]}
      canEdit={false}
      viewOnly
      basePath="/panel/takvim"
    />
  );
}
