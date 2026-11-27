import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";
import { DmPageHeader } from "@/components/dm/app/parts";
import { HoursWarning } from "@/components/dm/appointments/HoursWarning";

export const metadata = { title: "Randevular" };

export default async function DmAppointmentsPage() {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: user.clientId }, select: { dmModuleAppointment: true } });
  if (!client.dmModuleAppointment) redirect("/mesaj");
  return (
    <>
      <DmPageHeader title="Randevular" />
      <div className="space-y-3 px-3 pt-2">
        <HoursWarning clientId={user.clientId} basePath="/mesaj" linkToTab={false} />
        <DmWorkspaceTab tab="randevu" clientId={user.clientId} viewer="CLIENT" basePath="/mesaj" />
      </div>
    </>
  );
}
