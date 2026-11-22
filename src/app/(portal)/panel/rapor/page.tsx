import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { MONTHS } from "@/lib/format";

/** Müşteri paneli: kendisine gönderilen aylık raporlar. */
export default async function PortalReports() {
  const user = await requirePortalUser();
  const reports = await prisma.clientReport.findMany({
    where: { clientId: user.clientId, publishedAt: { not: null } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, year: true, month: true, publishedAt: true },
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Raporlar</h1>
        <p className="text-sm text-(--color-text-muted)">Aylık çalışma raporlarınız. Bir raporu açıp yazdırabilir ya da PDF olarak kaydedebilirsiniz.</p>
      </div>
      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-(--color-border) bg-(--color-surface) p-8 text-center text-sm text-(--color-text-muted)">
          Henüz size gönderilmiş bir rapor yok.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/panel/rapor/${r.id}`} className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-4 hover:border-brand-500">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/20">
                  <FileText size={18} />
                </span>
                <span>
                  <span className="block text-sm font-bold">
                    {MONTHS[r.month - 1]} {r.year} raporu
                  </span>
                  <span className="text-xs text-(--color-text-muted)">
                    {r.publishedAt?.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" })} tarihinde eklendi
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
