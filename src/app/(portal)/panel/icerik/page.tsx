import { requirePortalUser } from "@/lib/clientPortal";
import { loadContent, loadContentMonths, parseMonthParams } from "@/lib/contentData";
import { SocialServiceNotice } from "@/components/portal/SocialServiceNotice";
import { ContentWorkspace } from "@/components/content/ContentWorkspace";

export default async function PortalContent({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const user = await requirePortalUser();
  if (!user.socialManaged) return <SocialServiceNotice title="İçerik Paneli" />;
  const sp = await searchParams;
  const { year, month } = parseMonthParams(sp.y, sp.m);
  const [{ items, docs }, months] = await Promise.all([
    loadContent(user.clientId, year, month, { forClient: true, hideBrief: !user.contentEditable }),
    loadContentMonths(user.clientId),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">İçerik Paneli</h1>
        <p className="text-sm text-(--color-text-muted)">
          {user.contentEditable
            ? "Kendi içeriklerinizi tablo ya da düz yazı olarak yazabilirsiniz; ekibimiz buradan görür. Bizim sizin için yazdığımız içerikler de burada görünür. Tamamladığımız işler \"Tamamlanan\" sütununda sizi bekler: onaylayabilir ya da revize isteyebilirsiniz."
            : "Sizin için hazırladığımız çalışmalar burada onayınızı bekler. Görseli ve paylaşım metnini (caption) inceleyip onaylayabilir ya da revize isteyebilirsiniz."}
        </p>
      </div>
      <ContentWorkspace
        clientId={user.clientId}
        basePath="/panel/icerik"
        year={year}
        month={month}
        items={items}
        docs={docs}
        canEdit={user.contentEditable}
        months={months}
        canReview
        clientView
        canRevise={user.shareRevisionEnabled}
        briefHidden={!user.contentEditable}
      />
    </div>
  );
}
