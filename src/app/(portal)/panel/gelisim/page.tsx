import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { SOCIAL_RANGES, loadSocialReport } from "@/lib/socialData";
import { SocialReport } from "@/components/social/SocialReport";

/** Müşteri paneli: kendi Instagram hesabının gelişimi (yönetici açtıysa; salt okunur). */
export default async function PortalGrowth({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requirePortalUser();
  const { range: rangeParam } = await searchParams;
  const range = SOCIAL_RANGES.find((r) => r.key === rangeParam) ?? SOCIAL_RANGES[1];

  const account = await prisma.socialAccount.findFirst({
    where: { clientId: user.clientId, visibleToClient: true },
    orderBy: { createdAt: "asc" },
  });
  // Yönetici bu müşteri için açmadıysa böyle bir sayfa yokmuş gibi davranır (menüde de görünmez).
  if (!account) notFound();
  const data = await loadSocialReport(account.id, range.days);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Gelişim</h1>
          <p className="text-sm text-(--color-text-muted)">Instagram hesabınızın takipçi, ziyaret ve erişim gelişimi.</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-(--color-border)">
          {SOCIAL_RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/panel/gelisim?range=${r.key}`}
              className={`px-3 py-2 text-xs font-semibold ${range.key === r.key ? "bg-brand-600 text-white" : "bg-(--color-surface) hover:bg-(--color-surface-muted)"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>
      {data ? (
        <SocialReport data={data} />
      ) : (
        <div className="rounded-xl border border-dashed border-(--color-border) bg-(--color-surface) p-8 text-center text-sm text-(--color-text-muted)">
          Gelişim raporunuz hazırlanıyor. Çok yakında burada görebileceksiniz.
        </div>
      )}
    </div>
  );
}
