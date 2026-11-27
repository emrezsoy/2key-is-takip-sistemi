import { requirePortalUser } from "@/lib/clientPortal";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";
import { DmPageHeader } from "@/components/dm/app/parts";

export const metadata = { title: "AI'ı test et" };

export default async function DmTestPage() {
  const user = await requirePortalUser();
  return (
    <>
      <DmPageHeader title="AI'ı test et" back="/mesaj/daha">
        <p className="mt-1 text-[13px] text-(--color-text-muted)">Müşteriniz gibi yazın, AI asistanınızın nasıl cevap verdiğini görün. Gerçek kişiye mesaj gitmez.</p>
      </DmPageHeader>
      <div className="px-3 pt-2">
        <DmWorkspaceTab tab="test" clientId={user.clientId} viewer="CLIENT" basePath="/mesaj" />
      </div>
    </>
  );
}
