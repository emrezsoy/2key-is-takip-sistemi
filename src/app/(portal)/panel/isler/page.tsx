import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { formatDate, URGENCY_LABEL, URGENCY_STYLE } from "@/lib/format";
import { CLIENT_STATUS_LABEL, CLIENT_STATUS_STYLE } from "@/lib/portalText";

export default async function PortalJobs() {
  const user = await requirePortalUser();
  const tasks = await prisma.task.findMany({
    where: { clientId: user.clientId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      urgency: true,
      completedAt: true,
      createdAt: true,
      request: { select: { id: true } },
    },
  });

  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");

  const Row = ({ t }: { t: (typeof tasks)[number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{t.title}</p>
        <p className="text-xs text-(--color-text-muted)">
          {t.request ? "Talebiniz · " : ""}
          {t.status === "DONE" && t.completedAt
            ? `Tamamlandı: ${formatDate(t.completedAt)}`
            : `Eklendi: ${formatDate(t.createdAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {t.status !== "DONE" && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[t.urgency]}`}>
            {URGENCY_LABEL[t.urgency]}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLIENT_STATUS_STYLE[t.status]}`}>
          {CLIENT_STATUS_LABEL[t.status]}
        </span>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">İşlerim</h1>
        <p className="text-sm text-(--color-text-muted)">Sizin için yürüttüğümüz işlerin güncel durumu.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Devam eden ({open.length})</h2>
        {open.length === 0 && <p className="text-sm text-(--color-text-muted)">Şu an devam eden iş yok.</p>}
        <ul className="space-y-2">{open.map((t) => <Row key={t.id} t={t} />)}</ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Tamamlanan ({done.length})</h2>
        {done.length === 0 && <p className="text-sm text-(--color-text-muted)">Henüz tamamlanan iş yok.</p>}
        <ul className="space-y-2">{done.slice(0, 40).map((t) => <Row key={t.id} t={t} />)}</ul>
      </section>
    </div>
  );
}
