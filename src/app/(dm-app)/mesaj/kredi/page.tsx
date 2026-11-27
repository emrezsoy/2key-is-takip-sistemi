import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { creditState } from "@/lib/dm/credits";
import { DmTopBar } from "@/components/dm/portal/DmTopBar";
import { CreditSummary } from "@/components/dm/credits/CreditSummary";
import { LedgerList } from "@/components/dm/credits/LedgerList";
import { DmPageHeader } from "@/components/dm/app/parts";

export const metadata = { title: "Kredi ve AI" };

export default async function DmCreditPage() {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: user.clientId }, select: { id: true, dmPaused: true } });
  const [state, openRequest, rows] = await Promise.all([
    creditState(client.id),
    prisma.dmCreditRequest.count({ where: { clientId: client.id, resolvedAt: null } }),
    prisma.dmCreditLedger.findMany({ where: { clientId: client.id, NOT: { type: "PLAN_EXPIRE", amount: 0 } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <>
      <DmPageHeader title="Kredi ve AI" back="/mesaj/daha" />
      <div className="space-y-3 px-3 pt-2">
        <DmTopBar
          clientId={client.id}
          total={state.total}
          approxReplies={state.approxReplies}
          paused={client.dmPaused}
          canReply={state.canReply}
          grace={state.subscription === "GRACE"}
          openRequest={openRequest > 0}
        />
        <CreditSummary state={state} />
        <LedgerList forClient rows={rows} />
      </div>
    </>
  );
}
