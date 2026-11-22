import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditShareCalendar, canViewShareCalendar, getShareAccess } from "@/lib/shareCalendar";
import { refreshPublishAccess } from "@/lib/metaPublish";
import { getClientScope } from "@/lib/clientAccess";
import { ShareCalendar } from "@/components/share/ShareCalendar";
import { defaultClientColor } from "@/components/share/palette";
import type { ShareClient, SharePostRow } from "@/components/share/types";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export default async function PaylasimTakvimiPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; musteri?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  const access = await getShareAccess(session.user);
  if (!canViewShareCalendar(access)) redirect("/");

  // "Bugün" Türkiye saatine göre.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const [ty, tm] = today.split("-").map(Number);

  const { year: yearParam, month: monthParam, musteri } = await searchParams;
  const year = Number(yearParam) || ty;
  const monthNum = Number(monthParam);
  const month = monthNum >= 1 && monthNum <= 12 ? monthNum : tm;

  // Pazartesi başlangıçlı ay ızgarası (önceki/sonraki ayın taşan günleri dahil).
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    return { date: toIso(d), inMonth: d.getUTCMonth() === month - 1 };
  });

  // Hangi müşteride paylaşım yetkimiz var: Meta'dan en fazla 10 dakikada bir tazelenir (yanıt gecikirse beklenmez).
  await Promise.race([refreshPublishAccess().catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);

  // Admin dışındakiler sadece sorumlu oldukları müşterilerin paylaşımlarını görür.
  const scope = await getClientScope(session.user);

  const [posts, clients, socialAccounts] = await Promise.all([
    prisma.sharePost.findMany({
      where: {
        date: { gte: days[0].date, lte: days[days.length - 1].date },
        ...(scope ? { clientId: { in: scope } } : {}),
      },
      include: {
        client: { select: { name: true } },
        images: { orderBy: { position: "asc" } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.client.findMany({
      where: { isActive: true },
      select: { id: true, name: true, shareColor: true },
      orderBy: { name: "asc" },
    }),
    // "Meta'da planla" sadece Meta'da bağlı sayfası olan müşteriler için açılır.
    prisma.socialAccount.findMany({
      where: { clientId: { not: null } },
      select: { clientId: true, canPublish: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Müşteri başına ilk bağlı hesap geçerlidir (paylaşım da o hesaba yapılır).
  const accessOf = new Map<string, "OK" | "NO_PERMISSION">();
  for (const a of socialAccounts) {
    if (a.clientId && !accessOf.has(a.clientId)) accessOf.set(a.clientId, a.canPublish ? "OK" : "NO_PERMISSION");
  }

  // Müşteri rengi: elle seçilmişse o, değilse alfabetik sıradaki konumuna göre otomatik.
  const shareClients: ShareClient[] = clients.map((c, i) => ({
    id: c.id,
    name: c.name,
    color: c.shareColor ?? defaultClientColor(i),
    custom: !!c.shareColor,
  }));
  const colorOf = new Map(shareClients.map((c) => [c.id, c.color]));
  // Renkler tüm müşteri listesine göre atanır (herkeste aynı renk görünsün); seçilebilecek müşteriler kapsamla sınırlı.
  const visibleClients = scope ? shareClients.filter((c) => scope.includes(c.id)) : shareClients;

  const rows: SharePostRow[] = posts.map((p) => ({
    id: p.id,
    date: p.date,
    clientId: p.clientId,
    clientName: p.client?.name ?? p.clientName,
    color: (p.clientId ? colorOf.get(p.clientId) : undefined) ?? defaultClientColor(0),
    title: p.title,
    text: p.text,
    kind: p.kind,
    time: p.time,
    published: !!p.publishedAt,
    metaScheduled: p.metaScheduled,
    metaStatus: (p.metaStatus as SharePostRow["metaStatus"]) ?? null,
    metaError: p.metaError,
    metaAccess: (p.clientId ? accessOf.get(p.clientId) : undefined) ?? "NO_ACCOUNT",
    igPermalink: p.igPermalink,
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
      clients={canEditShareCalendar(access) ? visibleClients : []}
      canEdit={canEditShareCalendar(access)}
      initialClient={musteri ?? ""}
    />
  );
}
