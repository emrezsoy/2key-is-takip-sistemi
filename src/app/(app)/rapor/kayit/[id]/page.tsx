import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ReportData } from "@/lib/reports";
import { ClientReportView } from "@/components/reports/ClientReportView";
import { PrintButton } from "@/components/reports/PrintButton";
import { StoredReportActions } from "@/components/reports/ReportControls";

/** Kayıtlı (dondurulmuş) müşteri raporu: yönetici inceler, yazdırır / PDF alır, müşteriye gönderir. */
export default async function StoredReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");
  const { id } = await params;
  const report = await prisma.clientReport.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!report) notFound();
  const data = JSON.parse(report.data) as ReportData;
  const monthKey = `${report.year}-${String(report.month).padStart(2, "0")}`;

  return (
    <div className="print-wrap mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/rapor?sekme=musteri&musteri=${report.clientId}&ay=${monthKey}`}
          className="flex items-center gap-1.5 text-sm font-medium text-(--color-text-muted) hover:text-brand-600"
        >
          <ArrowLeft size={15} /> Müşteri raporuna dön
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          <StoredReportActions reportId={report.id} published={!!report.publishedAt} clientName={report.client.name} />
        </div>
      </div>
      <p className="no-print rounded-lg bg-(--color-surface-muted) px-3 py-2 text-xs text-(--color-text-muted)">
        {report.publishedAt
          ? `Bu rapor ${report.publishedAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" })} tarihinde müşteri paneline gönderildi.`
          : "Taslak: müşteri henüz görmüyor. Kontrol edip Müşteriye gönder dediğinde müşteri panelinde görünür ve müşteriye bildirim gider."}
      </p>
      <ClientReportView data={data} />
    </div>
  );
}
