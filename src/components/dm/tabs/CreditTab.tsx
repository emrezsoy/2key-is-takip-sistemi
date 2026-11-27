import { prisma } from "@/lib/prisma";
import { creditState } from "@/lib/dm/credits";
import { CreditSummary } from "../credits/CreditSummary";
import { LedgerList } from "../credits/LedgerList";
import { PaymentForm } from "../credits/PaymentForm";
import { CreditAdjustForm } from "../credits/CreditAdjustForm";
import { PeriodList } from "../credits/PeriodList";
import { ResolveCreditRequestButton } from "../credits/ResolveCreditRequestButton";
import { cardCls, fmtDateTime } from "../ui";

/** Admin: müşterinin kredi durumu, ödeme girişi, düzeltmeler, dönemler ve kayıt defteri. Ekip üyesi sadece görür. */
export async function CreditTab({ clientId, isAdmin }: { clientId: string; isAdmin: boolean }) {
  const [state, ledger, periods, plans, requests] = await Promise.all([
    creditState(clientId),
    prisma.dmCreditLedger.findMany({ where: { clientId, NOT: { type: "PLAN_EXPIRE", amount: 0 } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.dmSubscriptionPeriod.findMany({ where: { clientId }, orderBy: { startDate: "desc" }, include: { plan: { select: { name: true } } } }),
    prisma.dmPlan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.dmCreditRequest.findMany({ where: { clientId, resolvedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <CreditSummary state={state} />
        {requests.length > 0 && (
          <div className={`${cardCls} border-amber-300 bg-amber-50/60 dark:bg-amber-900/10`}>
            <h3 className="mb-1 text-sm font-bold">Açık kredi talebi</h3>
            {requests.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 text-sm">
                <p>
                  {r.requestedByName ?? "Müşteri"} · {fmtDateTime(r.createdAt)}
                  {r.note && <span className="block text-xs text-(--color-text-muted)">{r.note}</span>}
                </p>
                {isAdmin && <ResolveCreditRequestButton id={r.id} />}
              </div>
            ))}
            <p className="mt-1 text-[11px] text-(--color-text-muted)">Ödeme ya da kredi yüklemesi girilince talep kendiliğinden kapanır.</p>
          </div>
        )}
        {isAdmin && <PaymentForm clientId={clientId} plans={plans.map((p) => ({ id: p.id, name: p.name, monthlyCredits: p.monthlyCredits, priceNote: p.priceNote }))} />}
        {isAdmin && <CreditAdjustForm clientId={clientId} />}
        <PeriodList
          canCancel={isAdmin}
          rows={periods.map((p) => ({
            id: p.id, planName: p.plan.name, monthlyCredits: p.monthlyCredits, months: p.months, startDate: p.startDate,
            paidThrough: p.paidThrough, note: p.note, createdByName: p.createdByName, cancelledAt: p.cancelledAt, hasIncome: !!p.incomeId,
          }))}
        />
      </div>
      <LedgerList rows={ledger} />
    </div>
  );
}
