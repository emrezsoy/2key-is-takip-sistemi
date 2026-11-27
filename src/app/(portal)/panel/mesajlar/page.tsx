import { Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { creditState } from "@/lib/dm/credits";
import { TabNav, type DmTab } from "@/components/dm/tabs/TabNav";
import { HoursWarning } from "@/components/dm/appointments/HoursWarning";
import { DmWorkspaceTab } from "@/components/dm/tabs/WorkspaceTab";
import { DmTopBar } from "@/components/dm/portal/DmTopBar";
import { CreditSummary } from "@/components/dm/credits/CreditSummary";
import { LedgerList } from "@/components/dm/credits/LedgerList";

export const metadata = { title: "Mesajlar" };

export default async function PortalMessagesPage({ searchParams }: { searchParams: Promise<{ sekme?: string; k?: string; f?: string }> }) {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: user.clientId },
    select: { id: true, dmManaged: true, dmPaused: true, dmModuleAppointment: true, dmModuleProducts: true },
  });

  if (!client.dmManaged) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Mesajlar</h1>
        <div className="flex items-start gap-3 rounded-xl border border-brand-500/40 bg-brand-50 p-5 dark:bg-brand-900/10">
          <Info size={20} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-bold">Mesaj Otomasyonu hizmeti almıyorsunuz</p>
            <p className="mt-1 text-sm text-(--color-text-muted)">
              Bu hizmetle Instagram ve Facebook mesajlarınızı yapay zekâ asistanı sizin üslubunuzla, 7/24 yanıtlar; randevu ve ürün sorularını
              karşılar, sıcak müşterileri size bildirir. Bilgi almak için bizimle iletişime geçebilirsiniz.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { sekme, k, f } = await searchParams;
  const [state, pendingQ, pendingA, pendingF, waiting, openRequest] = await Promise.all([
    creditState(client.id),
    prisma.dmOwnerQuestion.count({ where: { clientId: client.id, status: "PENDING" } }),
    prisma.dmAppointment.count({ where: { clientId: client.id, status: "REQUESTED" } }),
    prisma.dmFollowUp.count({ where: { clientId: client.id, status: "PENDING_APPROVAL" } }),
    prisma.dmConversation.count({ where: { clientId: client.id, waitingHuman: true } }),
    prisma.dmCreditRequest.count({ where: { clientId: client.id, resolvedAt: null } }),
  ]);
  const tabs: DmTab[] = [
    { key: "gelen", label: "Gelen kutusu", badge: waiting },
    { key: "bekleyen", label: "Bekleyen işler", badge: pendingQ + pendingA + pendingF },
    ...(client.dmModuleAppointment ? [{ key: "randevu", label: "Randevular" }] : []),
    ...(client.dmModuleProducts ? [{ key: "urunler", label: "Ürünler" }] : []),
    { key: "isletme", label: "İşletme bilgileri" },
    { key: "test", label: "Test et" },
    { key: "kredi", label: "Kredi geçmişi" },
  ];
  const active = tabs.some((t) => t.key === sekme) ? sekme! : "gelen";
  const basePath = "/panel/mesajlar";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mesajlar</h1>
      <DmTopBar
        clientId={client.id}
        total={state.total}
        approxReplies={state.approxReplies}
        paused={client.dmPaused}
        canReply={state.canReply}
        grace={state.subscription === "GRACE"}
        openRequest={openRequest > 0}
      />
      {client.dmModuleAppointment && <HoursWarning clientId={client.id} basePath={basePath} linkToTab={active !== "randevu"} />}
      <TabNav tabs={tabs} active={active} basePath={basePath} />
      {active === "kredi" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <CreditSummary state={state} />
          <LedgerList
            forClient
            rows={await prisma.dmCreditLedger.findMany({ where: { clientId: client.id, NOT: { type: "PLAN_EXPIRE", amount: 0 } }, orderBy: { createdAt: "desc" }, take: 200 })}
          />
        </div>
      ) : (
        <DmWorkspaceTab tab={active} clientId={client.id} viewer="CLIENT" conversationId={k} basePath={basePath} filter={f} />
      )}
    </div>
  );
}
