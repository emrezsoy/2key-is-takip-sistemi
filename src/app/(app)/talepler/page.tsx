import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, URGENCY_LABEL, URGENCY_STYLE } from "@/lib/format";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_STYLE } from "@/lib/portalText";
import { RequestReview } from "@/components/clients/RequestReview";
import { RequestFilesGrid } from "@/components/portal/RequestFilesGrid";
import { DeliveryBox } from "@/components/delivery/DeliveryBox";
import { toDeliveryInfo } from "@/lib/contentData";

export default async function TaleplerPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const requests = await prisma.clientRequest.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      client: { select: { name: true } },
      task: { select: { status: true } },
      files: { orderBy: { position: "asc" }, select: { id: true, url: true, name: true } },
      deliveryFiles: { orderBy: { position: "asc" } },
    },
  });
  const creators = await prisma.user.findMany({
    where: { id: { in: [...new Set(requests.map((r) => r.createdById))] } },
    select: { id: true, fullName: true },
  });
  const nameOf = (id: string) => creators.find((c) => c.id === id)?.fullName ?? "";

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  const Card = ({ r }: { r: (typeof requests)[number] }) => (
    <li className="space-y-2 rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{r.title}</p>
          <p className="text-xs text-(--color-text-muted)">
            {r.client.name} · {nameOf(r.createdById)} · {formatDate(r.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
        </div>
      </div>
      {r.details && <p className="whitespace-pre-wrap text-sm text-(--color-text-muted)">{r.details}</p>}
      {r.note && <p className="text-xs text-(--color-text-muted)">Müşteri notu: {r.note}</p>}
      <RequestFilesGrid requestId={r.id} files={r.files} canRemove />
      {r.decisionNote && <p className="text-xs text-(--color-text-muted)">Verilen not: {r.decisionNote}</p>}
      {toDeliveryInfo(r) && (
        <div className="space-y-1.5 rounded-lg border border-(--color-border) p-3">
          <p className="text-xs font-semibold">Müşteriye sunulan çalışma</p>
          <DeliveryBox target={{ type: "request", id: r.id }} delivery={toDeliveryInfo(r)} title={r.title} canClear />
        </div>
      )}
      {r.status === "PENDING" && <RequestReview requestId={r.id} urgency={r.urgency} isRevision={r.kind === "REVISION"} />}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Müşteri Talepleri</h1>
        <p className="text-sm text-(--color-text-muted)">
          Onayladığınız talep, müşterinin iş listesine &quot;müşteri talebi&quot;, tamamlanan işler için müşterinin verdiği revize istekleri ise &quot;müşteri revizesi&quot; olarak düşer.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Onay bekleyen ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-(--color-text-muted)">Bekleyen talep yok.</p>}
        <ul className="space-y-3">{pending.map((r) => <Card key={r.id} r={r} />)}</ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Sonuçlanan ({decided.length})</h2>
        <ul className="space-y-3">{decided.map((r) => <Card key={r.id} r={r} />)}</ul>
      </section>
    </div>
  );
}
