import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { LiveRefresh } from "@/components/LiveRefresh";
import { canEditShareCalendar, canViewShareCalendar, getShareAccess } from "@/lib/shareCalendar";
import { ShareEditProvider } from "@/components/share/ShareEditContext";
import { canViewAdPanel } from "@/lib/adsAccess";
import { getClientScope } from "@/lib/clientAccess";
import { canUseProposals } from "@/lib/proposalAccess";
import { canUseDm } from "@/lib/dm/access";
import { SwRegister } from "@/components/portal/SwRegister";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  if (session.user.role === "CLIENT") redirect("/panel");

  const [me, notifications, unreadCount, shareAccess, adPanel, proposals, clientScope, pendingRequests, dm] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatarUrl: true },
    }),
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
    getShareAccess(session.user),
    canViewAdPanel(session.user),
    canUseProposals(session.user),
    getClientScope(session.user),
    // Onay bekleyen müşteri talepleri ve revize istekleri (sadece yönetici görür).
    session.user.role === "ADMIN" ? prisma.clientRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    canUseDm(session.user),
  ]);
  const navAccess = { shareCalendar: canViewShareCalendar(shareAccess), adPanel, proposals, dm };
  const navBadges: Record<string, number> = pendingRequests > 0 ? { "/talepler": pendingRequests } : {};

  return (
    <div className="flex min-h-screen w-full">
      <SwRegister />
      <LiveRefresh />
      <Sidebar role={session.user.role} access={navAccess} badges={navBadges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          fullName={session.user.name ?? session.user.username}
          role={session.user.role}
          navAccess={navAccess}
          navBadges={navBadges}
          avatarUrl={me?.avatarUrl}
          notifications={notifications}
          unreadCount={unreadCount}
        />
        <main className="flex-1 overflow-y-auto bg-(--color-bg) p-4 pb-24 sm:p-6 lg:pb-6">
          {/* Admin dışındakiler sadece sorumlu oldukları müşterilere gönderebilir (sunucu da denetler). */}
          <ShareEditProvider canEdit={canEditShareCalendar(shareAccess) && (clientScope === null || clientScope.length > 0)}>
            {children}
          </ShareEditProvider>
        </main>
      </div>
    </div>
  );
}
