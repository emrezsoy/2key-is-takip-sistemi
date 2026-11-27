import { requirePortalUser } from "@/lib/clientPortal";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";
import { DmPageHeader } from "@/components/dm/app/parts";

export const metadata = { title: "İşletme bilgileri" };

export default async function DmBusinessPage() {
  const user = await requirePortalUser();
  return (
    <>
      <DmPageHeader title="İşletme">
        <p className="mt-1 text-[13px] text-(--color-text-muted)">AI asistanınızın müşterilerinize cevap verirken kullandığı bilgiler.</p>
      </DmPageHeader>
      <div className="px-3 pt-2">
        <DmWorkspaceTab tab="isletme" clientId={user.clientId} viewer="CLIENT" basePath="/mesaj" />
      </div>
    </>
  );
}
