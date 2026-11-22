import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import type { ReportData } from "@/lib/reports";
import { ClientReportView } from "@/components/reports/ClientReportView";
import { PrintButton } from "@/components/reports/PrintButton";

/** Müşteri paneli: gönderilmiş bir aylık rapor (sadece kendi raporu; yazdırılabilir). */
export default async function PortalReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalUser();
  const { id } = await params;
  const report = await prisma.clientReport.findFirst({ where: { id, clientId: user.clientId, publishedAt: { not: null } } });
  if (!report) notFound();
  const data = JSON.parse(report.data) as ReportData;
  return (
    <div className="print-wrap mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/panel/rapor" className="flex items-center gap-1.5 text-sm font-medium text-(--color-text-muted) hover:text-brand-600">
          <ArrowLeft size={15} /> Raporlara dön
        </Link>
        <PrintButton />
      </div>
      <ClientReportView data={data} />
    </div>
  );
}
