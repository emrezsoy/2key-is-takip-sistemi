import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireDmActor } from "@/lib/dm/access";
import { TabNav, type DmTab } from "@/components/dm/tabs/TabNav";
import { HoursWarning } from "@/components/dm/appointments/HoursWarning";
import { CreditTab } from "@/components/dm/tabs/CreditTab";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";

export default async function DmClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ sekme?: string; k?: string; f?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  const clientId = decodeURIComponent((await params).clientId);
  const { sekme, k, f } = await searchParams;
  try {
    await requireDmActor(session.user, clientId);
  } catch {
    redirect("/mesaj-otomasyonu");
  }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, dmManaged: true, dmModuleAppointment: true, dmModuleProducts: true },
  });
  if (!client) notFound();
  const isAdmin = session.user.role === "ADMIN";

  const [pendingQuestions, pendingAppointments, pendingFollowUps, waiting] = await Promise.all([
    prisma.dmOwnerQuestion.count({ where: { clientId, status: "PENDING" } }),
    prisma.dmAppointment.count({ where: { clientId, status: "REQUESTED" } }),
    prisma.dmFollowUp.count({ where: { clientId, status: "PENDING_APPROVAL" } }),
    prisma.dmConversation.count({ where: { clientId, waitingHuman: true } }),
  ]);
  const tabs: DmTab[] = [
    { key: "gelen", label: "Gelen kutusu", badge: waiting },
    { key: "bekleyen", label: "Bekleyen işler", badge: pendingQuestions + pendingAppointments + pendingFollowUps },
    ...(client.dmModuleAppointment ? [{ key: "randevu", label: "Randevular" }] : []),
    ...(client.dmModuleProducts ? [{ key: "urunler", label: "Ürünler" }] : []),
    { key: "isletme", label: "İşletme bilgileri ve AI" },
    { key: "test", label: "Test et" },
    { key: "kredi", label: "Kredi" },
    { key: "ayarlar", label: "Ayarlar" },
  ];
  const active = tabs.some((t) => t.key === sekme) ? sekme! : "gelen";
  const basePath = `/mesaj-otomasyonu/${encodeURIComponent(clientId)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/mesaj-otomasyonu" className="inline-flex items-center gap-1 text-sm text-(--color-text-muted) hover:text-brand-600">
        <ArrowLeft size={14} /> Mesaj Otomasyonu
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{client.name}</h1>
        {!client.dmManaged && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Hizmet kapalı
          </span>
        )}
      </div>
      {client.dmModuleAppointment && <HoursWarning clientId={clientId} basePath={basePath} linkToTab={active !== "randevu"} />}
      <TabNav tabs={tabs} active={active} basePath={basePath} />
      {active === "kredi" ? (
        <CreditTab clientId={clientId} isAdmin={isAdmin} />
      ) : (
        <DmWorkspaceTab tab={active} clientId={clientId} viewer={isAdmin ? "ADMIN" : "STAFF"} conversationId={k} basePath={basePath} filter={f} />
      )}
    </div>
  );
}
