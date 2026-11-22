import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewAdPanel } from "@/lib/adsAccess";
import { getClientScope } from "@/lib/clientAccess";
import { SOCIAL_RANGES, loadSocialReport } from "@/lib/socialData";
import { SocialReport } from "@/components/social/SocialReport";
import { SocialAdminBar } from "@/components/social/SocialAdminBar";

const fmtSync = (d: Date | null) =>
  d ? d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

/** Listede müşteri adı görünür; müşteriye bağlı değilse sayfa adı. Aynı müşterinin birden çok hesabı varsa Instagram adı eklenir. */
function labelOf(a: { client: { name: string } | null; pageName: string; igUsername: string | null }, dup: boolean) {
  const base = a.client?.name ?? `${a.pageName} (müşteri seçilmemiş)`;
  return dup && a.igUsername ? `${base} · @${a.igUsername}` : base;
}

export default async function SosyalMedyaPage({ searchParams }: { searchParams: Promise<{ hesap?: string; range?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  if (!(await canViewAdPanel(session.user))) redirect("/");

  const { hesap, range: rangeParam } = await searchParams;
  const range = SOCIAL_RANGES.find((r) => r.key === rangeParam) ?? SOCIAL_RANGES[1];

  // Admin dışındakiler sadece sorumlu oldukları müşterilerin hesaplarını görür.
  const scope = await getClientScope(session.user);
  const [accounts, clients] = await Promise.all([
    prisma.socialAccount.findMany({
      where: scope ? { clientId: { in: scope } } : {},
      orderBy: { pageName: "asc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.client.findMany({
      where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const nameFor = (a: (typeof accounts)[number]) =>
    labelOf(a, accounts.filter((x) => x.clientId && x.clientId === a.clientId).length > 1);
  const current = accounts.find((a) => a.id === hesap) ?? accounts[0] ?? null;
  const data = current ? await loadSocialReport(current.id, range.days) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Sosyal Medya</h1>
        <p className="text-sm text-(--color-text-muted)">
          Müşterilerin Instagram hesaplarının takipçi gelişimi, profil ziyareti, erişim ve gönderi sonuçları. Veriler her gün otomatik kaydedilir.
        </p>
      </div>

      {!current || !data ? (
        <div className="rounded-xl border border-dashed border-(--color-border) bg-(--color-surface) p-8 text-center text-sm text-(--color-text-muted)">
          Henüz bağlı bir Instagram / Facebook hesabı görünmüyor. Meta Business&apos;ta sayfa ve Instagram hesabını PanelReadOnly sistem kullanıcısına
          &quot;İstatistikler&quot; yetkisiyle atayın; veriler otomatik gelir.
        </div>
      ) : (
        <>
          <SocialAdminBar
            accounts={accounts.map((a) => ({ id: a.id, label: nameFor(a) }))}
            accountId={current.id}
            range={range.key}
            ranges={SOCIAL_RANGES.map((r) => ({ key: r.key, label: r.label }))}
            clientId={current.clientId}
            clients={clients}
            visible={current.visibleToClient}
            lastSync={fmtSync(current.lastSyncAt)}
            lastError={current.lastError}
          />
          <SocialReport data={data} />
        </>
      )}
    </div>
  );
}
