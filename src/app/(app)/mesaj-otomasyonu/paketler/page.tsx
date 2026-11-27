import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPricing } from "@/lib/dm/pricing";
import { PlansAndPricing } from "@/components/dm/credits/PlansAndPricing";

export const metadata = { title: "Paketler ve fiyatlar" };

export default async function DmPlansPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/mesaj-otomasyonu");
  const [plans, pricing] = await Promise.all([
    prisma.dmPlan.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], include: { periods: { select: { clientId: true } } } }),
    getPricing(),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/mesaj-otomasyonu" className="inline-flex items-center gap-1 text-sm text-(--color-text-muted) hover:text-brand-600">
        <ArrowLeft size={14} /> Mesaj Otomasyonu
      </Link>
      <h1 className="text-xl font-bold">Paketler ve fiyatlar</h1>
      <PlansAndPricing
        plans={plans.map((p) => ({
          id: p.id, name: p.name, monthlyCredits: p.monthlyCredits, priceNote: p.priceNote, isActive: p.isActive, sortOrder: p.sortOrder,
          clientCount: new Set(p.periods.map((x) => x.clientId)).size,
        }))}
        pricing={{
          textCost: pricing.textCost, imageCost: pricing.imageCost, videoCost: pricing.videoCost, followUpCost: pricing.followUpCost,
          cachedMediaCost: pricing.cachedMediaCost, negativeLimit: pricing.negativeLimit, graceDays: pricing.graceDays,
          renewalNoticeDays: pricing.renewalNoticeDays, lowAlertPercents: pricing.lowAlertPercents,
        }}
      />
    </div>
  );
}
