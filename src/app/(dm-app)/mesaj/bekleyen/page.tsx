import { requirePortalUser } from "@/lib/clientPortal";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";
import { DmPageHeader } from "@/components/dm/app/parts";

export const metadata = { title: "Bekleyen işler" };

export default async function DmPendingPage() {
  const user = await requirePortalUser();
  return (
    <>
      <DmPageHeader title="Bekleyen işler">
        <p className="mt-1 text-[13px] text-(--color-text-muted)">AI&apos;ın size sorduğu sorular, randevu talepleri ve onay bekleyen mesajlar.</p>
      </DmPageHeader>
      <div className="px-3 pt-2">
        <DmWorkspaceTab tab="bekleyen" clientId={user.clientId} viewer="CLIENT" basePath="/mesaj" />
      </div>
    </>
  );
}
