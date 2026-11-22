import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/inAppNotify";
import { buildClientReport, monthBounds, monthLabel } from "@/lib/reports";

/** Raporu müşteri panelinde yayınlar: aynı müşteri-ay için eski kayıtlar silinir, müşteri kullanıcılarına bildirim gider. */
export async function publishReport(reportId: string) {
  const report = await prisma.clientReport.findUniqueOrThrow({ where: { id: reportId } });
  await prisma.$transaction([
    prisma.clientReport.deleteMany({ where: { clientId: report.clientId, year: report.year, month: report.month, id: { not: report.id } } }),
    prisma.clientReport.update({ where: { id: report.id }, data: { publishedAt: new Date() } }),
  ]);

  const users = await prisma.user.findMany({
    where: { role: "CLIENT", clientId: report.clientId, isActive: true, isDeleted: false },
    select: { id: true },
  });
  const label = monthLabel(report.year, report.month);
  await Promise.all(
    users.map((u) =>
      pushNotification({
        userId: u.id,
        type: "REPORT_READY",
        title: `${label} raporunuz hazır`,
        message: `${label} ayına ait çalışma raporunuz müşteri panelinize eklendi.`,
        url: `/panel/rapor/${report.id}`,
      })
    )
  );
  return report.id;
}

/** Müşteri-ay raporunu oluşturur (veriler o anda dondurulur). Aynı ay için yayınlanmamış taslak varsa onu günceller. */
export async function createReport(clientId: string, year: number, month: number, source: "AUTO" | "MANUAL", createdByName?: string | null) {
  const data = JSON.stringify(await buildClientReport(clientId, year, month));
  const draft = await prisma.clientReport.findFirst({ where: { clientId, year, month, publishedAt: null } });
  if (draft) {
    await prisma.clientReport.update({ where: { id: draft.id }, data: { data, source, createdByName: createdByName ?? null, createdAt: new Date() } });
    return draft.id;
  }
  const created = await prisma.clientReport.create({ data: { clientId, year, month, data, source, createdByName: createdByName ?? null } });
  return created.id;
}

const trParts = (d: Date) => {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d).split("-").map(Number);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }).format(d)) % 24;
  return { y, m, day, hour };
};

/** Her ayın 1'inde sabah 8'den sonra (sunucu kapalı kaldıysa sonraki saatlerde de): otomatik rapor seçili müşterilere önceki ayın raporunu
 * müşteri paneline ekler. Otomatik raporu o ay içinde açılan müşteriye geriye dönük rapor üretilmez. */
export async function runAutoReports(now = new Date()) {
  const { y, m, day, hour } = trParts(now);
  if (day === 1 && hour < 8) return;
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const thisMonthStart = monthBounds(y, m).from;

  const clients = await prisma.client.findMany({
    where: { isActive: true, autoMonthlyReport: true, autoReportSince: { lt: thisMonthStart } },
    select: { id: true },
  });
  for (const c of clients) {
    const exists = await prisma.clientReport.count({ where: { clientId: c.id, year: prev.y, month: prev.m, publishedAt: { not: null } } });
    if (exists > 0) continue;
    const id = await createReport(c.id, prev.y, prev.m, "AUTO");
    await publishReport(id);
  }
}
