import Link from "next/link";
import { AlertTriangle, CalendarHeart, CheckCircle2, ClipboardList, ListChecks, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { getClientPayments, istanbulToday } from "@/lib/clientPayments";
import { formatCurrency, formatDate } from "@/lib/format";
import { getGreetingParts } from "@/lib/greeting";
import { CLIENT_STATUS_LABEL, CLIENT_STATUS_STYLE } from "@/lib/portalText";

function Tile({
  href,
  icon: Icon,
  label,
  value,
  tone = "normal",
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  tone?: "normal" | "alert";
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 transition-colors hover:border-brand-500 ${
        tone === "alert" ? "border-brand-500/50 bg-brand-50 dark:bg-brand-900/10" : "border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <Icon size={18} className={tone === "alert" ? "text-brand-600" : "text-(--color-text-muted)"} />
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-(--color-text-muted)">{label}</p>
    </Link>
  );
}

export default async function PortalHome() {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: user.clientId },
    select: { id: true, name: true, paymentDueDay: true },
  });
  const today = istanbulToday();
  const todayIso = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

  const [payments, tasks, pendingRequests, posts] = await Promise.all([
    getClientPayments(client),
    prisma.task.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, title: true, status: true, calculatedDeadline: true, completedAt: true },
    }),
    prisma.clientRequest.count({ where: { clientId: client.id, status: "PENDING" } }),
    prisma.sharePost.findMany({
      where: { clientId: client.id, date: { gte: todayIso } },
      orderBy: { date: "asc" },
      take: 5,
      select: { id: true, date: true, title: true },
    }),
  ]);

  const social = user.socialManaged;
  const open = tasks.filter((t) => t.status !== "DONE");
  const { prefix, suffix } = getGreetingParts();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
        <div className="mb-3 h-1 w-10 rounded-full bg-brand-600" />
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {prefix}
          <span className="text-brand-600">{user.fullName.split(" ")[0]}</span>
          {suffix}
        </h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">{client.name} müşteri paneline hoş geldiniz.</p>
      </div>

      {payments.overdueCount > 0 && (
        <Link
          href="/panel/odemeler"
          className="flex items-start gap-3 rounded-xl border border-brand-500/50 bg-brand-50 p-4 dark:bg-brand-900/10"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-bold">Gecikmiş ödemeniz var</p>
            <p className="text-sm text-(--color-text-muted)">
              {payments.overdueCount} kalemde toplam{" "}
              <strong className="text-brand-600">{formatCurrency(payments.overdueAmount)}</strong> gecikmiş bakiye bulunuyor.
            </p>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile href="/panel/isler" icon={ListChecks} label="Devam eden iş" value={open.length} />
        {social && <Tile href="/panel/talepler" icon={ClipboardList} label="Onay bekleyen talep" value={pendingRequests} />}
        {social && <Tile href="/panel/takvim" icon={CalendarHeart} label="Yaklaşan paylaşım" value={posts.length} />}
        <Tile
          href="/panel/odemeler"
          icon={Wallet}
          label={payments.overdueCount > 0 ? "Gecikmiş bakiye" : "Kalan bakiye"}
          value={formatCurrency(payments.overdueCount > 0 ? payments.overdueAmount : payments.totalRemaining)}
          tone={payments.overdueCount > 0 ? "alert" : "normal"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h2 className="mb-3 text-sm font-bold">Devam eden işler</h2>
          {open.length === 0 && <p className="text-xs text-(--color-text-muted)">Şu an devam eden iş yok.</p>}
          <ul className="space-y-2">
            {open.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{t.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLIENT_STATUS_STYLE[t.status]}`}>
                  {CLIENT_STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
          {open.length > 6 && (
            <Link href="/panel/isler" className="mt-3 inline-block text-xs font-semibold text-brand-600">
              Tümünü gör
            </Link>
          )}
        </section>

        {social ? (
        <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h2 className="mb-3 text-sm font-bold">Yaklaşan paylaşımlar</h2>
          {posts.length === 0 && <p className="text-xs text-(--color-text-muted)">Planlanmış paylaşım yok.</p>}
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{p.title || "Paylaşım"}</span>
                <span className="shrink-0 text-xs text-(--color-text-muted)">{formatDate(`${p.date}T00:00:00`)}</span>
              </li>
            ))}
          </ul>
          <Link href="/panel/takvim" className="mt-3 inline-block text-xs font-semibold text-brand-600">
            Takvimi aç
          </Link>
        </section>
        ) : (
          <section className="rounded-xl border border-dashed border-(--color-border) bg-(--color-surface) p-4">
            <h2 className="mb-1 text-sm font-bold">Sosyal medya yönetim hizmeti almıyorsunuz</h2>
            <p className="text-xs text-(--color-text-muted)">
              İçerik paneli, tasarım talebi ve paylaşım takvimi yalnızca sosyal medya yönetimi hizmetimizi alan müşterilerimize açıktır.
            </p>
          </section>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
        <CheckCircle2 size={13} /> Ödeme tutarları KDV dahildir.
      </p>
    </div>
  );
}
