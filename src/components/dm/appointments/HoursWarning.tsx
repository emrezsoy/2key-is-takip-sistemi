import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";

/** Randevu modülü açık ama çalışma saati girilmemişse: AI randevu oluşturamaz, kullanıcıya açıkça söylenir. */
export async function HoursWarning({ clientId, basePath, linkToTab = true, href }: { clientId: string; basePath: string; linkToTab?: boolean; href?: string }) {
  const count = await prisma.dmAvailabilityRule.count({ where: { clientId, kind: "WEEKLY_OPEN" } });
  if (count > 0) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-400/60 bg-amber-50 p-4 dark:bg-amber-900/15">
      <CalendarClock size={20} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="text-sm">
        <p className="font-bold">Çalışma saatlerinizi girin</p>
        <p className="mt-1 text-(--color-text-muted)">
          Randevu sistemi açık ama çalışma saatleriniz girilmemiş. Saatler girilene kadar AI randevu oluşturamaz; randevu isteyen olursa size bildirim
          gönderir ve kişiye sizin döneceğinizi söyler.
        </p>
        {linkToTab ? (
          <Link href={href ?? `${basePath}?sekme=randevu#calisma-kurallari`} className="mt-2 inline-block text-sm font-semibold text-brand-600 underline">
            Çalışma saatlerini gir
          </Link>
        ) : (
          <a href="#calisma-kurallari" className="mt-2 inline-block text-sm font-semibold text-brand-600 underline">
            Çalışma kurallarına git
          </a>
        )}
      </div>
    </div>
  );
}
