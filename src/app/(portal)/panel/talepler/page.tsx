import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { formatDate, URGENCY_LABEL, URGENCY_STYLE } from "@/lib/format";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_STYLE,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_STYLE,
} from "@/lib/portalText";
import { SocialServiceNotice } from "@/components/portal/SocialServiceNotice";
import { RequestForm } from "@/components/portal/RequestForm";
import { RequestFilesGrid } from "@/components/portal/RequestFilesGrid";
import { DeliveryBox } from "@/components/delivery/DeliveryBox";
import { toDeliveryInfo } from "@/lib/contentData";

export default async function PortalRequests() {
  const user = await requirePortalUser();
  if (!user.socialManaged) return <SocialServiceNotice title="Talepler" />;
  const requests = await prisma.clientRequest.findMany({
    where: { clientId: user.clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      task: { select: { status: true, completedAt: true } },
      files: { orderBy: { position: "asc" }, select: { id: true, url: true, name: true } },
      deliveryFiles: { orderBy: { position: "asc" } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Talepler</h1>
          <p className="text-sm text-(--color-text-muted)">Bizden istediğiniz işleri buradan iletin ve takip edin. Tamamladığımız çalışmayı burada onaylayabilir ya da revize isteyebilirsiniz.</p>
        </div>
        <RequestForm />
      </div>

      <ul className="space-y-3">
        {requests.length === 0 && (
          <li className="rounded-xl border border-dashed border-(--color-border) p-8 text-center text-sm text-(--color-text-muted)">
            Henüz talep oluşturmadınız.
          </li>
        )}
        {requests.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{r.title}</p>
                <p className="text-xs text-(--color-text-muted)">{formatDate(r.createdAt)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {r.kind === "REVISION" && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                    Revize
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[r.urgency]}`}>
                  {URGENCY_LABEL[r.urgency]}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${REQUEST_STATUS_STYLE[r.status]}`}>
                  {REQUEST_STATUS_LABEL[r.status]}
                </span>
                {r.task && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLIENT_STATUS_STYLE[r.task.status]}`}>
                    {CLIENT_STATUS_LABEL[r.task.status]}
                  </span>
                )}
              </div>
            </div>
            {r.details && <p className="whitespace-pre-wrap text-sm text-(--color-text-muted)">{r.details}</p>}
            {r.note && <p className="text-xs text-(--color-text-muted)">Notunuz: {r.note}</p>}
            <RequestFilesGrid requestId={r.id} files={r.files} canRemove={r.status === "PENDING" && !r.taskId} />
            {r.decisionNote && (
              <p className="rounded-lg bg-(--color-surface-muted) p-2 text-xs">
                <strong>Ekibimizin notu:</strong> {r.decisionNote}
              </p>
            )}
            {toDeliveryInfo(r) && (
              <div className="space-y-1.5 rounded-lg border border-(--color-border) p-3">
                <p className="text-xs font-semibold">Tamamlanan çalışma</p>
                <DeliveryBox
                  target={{ type: "request", id: r.id }}
                  delivery={toDeliveryInfo(r)}
                  title={r.title}
                  canReview
                  canRevise={user.shareRevisionEnabled}
                />
              </div>
            )}
            {r.task?.status === "DONE" && r.task.completedAt && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Tamamlandı: {formatDate(r.task.completedAt)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
