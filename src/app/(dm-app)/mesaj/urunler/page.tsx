import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";
import { DmPageHeader } from "@/components/dm/app/parts";

export const metadata = { title: "Ürünler" };

export default async function DmProductsPage() {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: user.clientId }, select: { dmModuleProducts: true, dmModuleAppointment: true } });
  if (!client.dmModuleProducts) redirect("/mesaj");
  return (
    <>
      <DmPageHeader title="Ürünler" back={client.dmModuleAppointment ? "/mesaj/daha" : undefined} />
      <div className="px-3 pt-2">
        <DmWorkspaceTab tab="urunler" clientId={user.clientId} viewer="CLIENT" basePath="/mesaj" />
      </div>
    </>
  );
}
