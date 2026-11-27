import type { Metadata, Viewport } from "next";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { getClientPayments } from "@/lib/clientPayments";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PortalShell } from "@/components/portal/PortalShell";
import { ForcePasswordDialog } from "@/components/portal/ForcePasswordDialog";
import { PaymentPopup } from "@/components/portal/PaymentPopup";
import { PortalTour } from "@/components/portal/PortalTour";
import { SwRegister } from "@/components/portal/SwRegister";

export const metadata: Metadata = {
  title: "2 Key idea | Müşteri Paneli",
  description: "İşlerinizi, içeriklerinizi, reklamlarınızı ve ödemelerinizi takip edin.",
  appleWebApp: { capable: true, title: "2 Key idea", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ff2424",
  viewportFit: "cover",
};

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser();

  if (user.mustChangePassword) {
    return (
      <div className="min-h-dvh bg-(--color-bg)">
        <ForcePasswordDialog />
      </div>
    );
  }

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: user.clientId },
    select: { id: true, name: true, paymentDueDay: true, notifyMode: true, metaAdsManaged: true, googleAdsManaged: true, dmManaged: true },
  });
  const [notifications, unreadCount, payments, growthCount, reportCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    getClientPayments(client),
    prisma.socialAccount.count({ where: { clientId: client.id, visibleToClient: true } }),
    prisma.clientReport.count({ where: { clientId: client.id, publishedAt: { not: null } } }),
  ]);

  return (
    <>
      <SwRegister />
      <LiveRefresh intervalMs={20000} />
      <PortalShell
        clientName={client.name}
        fullName={user.fullName}
        notifications={notifications}
        unreadCount={unreadCount}
        overdue={payments.overdueCount > 0}
        growth={growthCount > 0}
        reports={reportCount > 0}
        dm={client.dmManaged}
        social={user.socialManaged}
      >
        {children}
      </PortalShell>
      <PortalTour
        autoStart={!user.tourDone}
        social={user.socialManaged}
        ads={client.metaAdsManaged || client.googleAdsManaged}
        dm={client.dmManaged}
      />
      {client.notifyMode === "LOGIN_POPUP" && payments.overdueCount > 0 && user.tourDone && (
        <PaymentPopup amount={payments.overdueAmount} count={payments.overdueCount} />
      )}
    </>
  );
}
