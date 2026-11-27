// Admin "Mesaj Otomasyonu" genel bakış verileri.
import { prisma } from "@/lib/prisma";
import { getPricing } from "./pricing";
import { approxReplies, canReply, totalOf } from "./creditMath";
import { renewalDue, subscriptionStatus } from "./periodMath";

const startOfTodayIstanbul = () => {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  return new Date(`${ymd}T00:00:00+03:00`);
};

export async function loadDmOverview(scope: string[] | null) {
  const where = { dmManaged: true, isActive: true, ...(scope ? { id: { in: scope } } : {}) };
  const [clients, pricing] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, dmPaused: true,
        dmConfig: { select: { planBalance: true, permanentBalance: true, stoppedAt: true } },
        dmPeriods: { select: { id: true, startDate: true, months: true, paidThrough: true, cancelledAt: true, monthlyCredits: true } },
      },
    }),
    getPricing(),
  ]);
  const ids = clients.map((c) => c.id);
  const today = startOfTodayIstanbul();
  const dayAgo = new Date(Date.now() - 864e5);
  const [todayCounts, waiting, failed, openRequests, pendingPrompts, pendingOnboard, connections] = await Promise.all([
    prisma.dmMessage.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, createdAt: { gte: today } }, _count: { _all: true } }),
    prisma.dmConversation.findMany({
      where: { clientId: { in: ids }, OR: [{ waitingHuman: true }, { handoffReason: { not: null }, mode: "HUMAN" }] },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
      select: { id: true, clientId: true, handoffReason: true, waitingHuman: true, lastMessageAt: true, contact: { select: { name: true, username: true } } },
    }),
    prisma.dmMessage.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: "FAILED", createdAt: { gte: dayAgo } }, _count: { _all: true } }),
    prisma.dmCreditRequest.findMany({ where: { clientId: { in: ids }, resolvedAt: null }, orderBy: { createdAt: "desc" }, include: { client: { select: { name: true } } } }),
    prisma.dmPromptVersion.findMany({ where: { clientId: { in: ids }, status: "PENDING" }, orderBy: { createdAt: "desc" }, include: { client: { select: { name: true } } } }),
    prisma.dmOnboardingSession.findMany({ where: { clientId: { in: ids }, status: "PENDING_APPROVAL" }, orderBy: { updatedAt: "desc" }, include: { client: { select: { name: true } } } }),
    prisma.socialAccount.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _count: { _all: true } }),
  ]);
  const now = new Date();
  const rows = clients.map((c) => {
    const balance = { plan: c.dmConfig?.planBalance ?? 0, permanent: c.dmConfig?.permanentBalance ?? 0 };
    const sub = subscriptionStatus(c.dmPeriods, now, pricing.graceDays);
    return {
      id: c.id,
      name: c.name,
      paused: c.dmPaused,
      total: totalOf(balance),
      approxReplies: approxReplies(balance, pricing.textCost),
      canReply: canReply(balance),
      subscription: sub.status,
      paidThrough: sub.paidThrough,
      renewalSoon: renewalDue(sub.paidThrough, now, pricing.renewalNoticeDays) || sub.status === "GRACE",
      todayMessages: todayCounts.find((t) => t.clientId === c.id)?._count._all ?? 0,
      failed24h: failed.find((t) => t.clientId === c.id)?._count._all ?? 0,
      waiting: waiting.filter((w) => w.clientId === c.id).length,
      hasAccount: (connections.find((x) => x.clientId === c.id)?._count._all ?? 0) > 0,
    };
  });
  return {
    rows,
    waiting: waiting.map((w) => ({ ...w, clientName: clients.find((c) => c.id === w.clientId)?.name ?? "" })),
    openRequests,
    pendingPrompts,
    pendingOnboard,
  };
}
