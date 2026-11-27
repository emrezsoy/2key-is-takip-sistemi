import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { SwRegister } from "@/components/portal/SwRegister";
import { DmAppShell } from "@/components/dm/app/DmAppShell";

export const metadata: Metadata = {
  title: "Mesajlar | 2 Key idea",
  description: "Instagram ve Facebook mesajlarınız, randevularınız ve AI asistanınız.",
  appleWebApp: { capable: true, title: "2 Key idea", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0a0a0a", viewportFit: "cover" };

/** Mesaj Otomasyonu uygulaması (müşteri): sistemin içinde ayrı bir uygulama gibi açılır. */
export default async function DmAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser();
  if (user.mustChangePassword) redirect("/panel");
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: user.clientId },
    select: { id: true, dmManaged: true, dmModuleAppointment: true, dmModuleProducts: true },
  });
  if (!client.dmManaged) redirect("/panel/mesajlar");

  const [unread, q, a, f] = await Promise.all([
    prisma.dmConversation.count({ where: { clientId: client.id, unreadCount: { gt: 0 } } }),
    prisma.dmOwnerQuestion.count({ where: { clientId: client.id, status: "PENDING" } }),
    prisma.dmAppointment.count({ where: { clientId: client.id, status: "REQUESTED" } }),
    prisma.dmFollowUp.count({ where: { clientId: client.id, status: "PENDING_APPROVAL" } }),
  ]);

  return (
    <>
      <SwRegister />
      <DmAppShell clientId={client.id} modules={{ appointment: client.dmModuleAppointment, products: client.dmModuleProducts }} unread={unread} pending={q + a + f}>
        {children}
      </DmAppShell>
    </>
  );
}
