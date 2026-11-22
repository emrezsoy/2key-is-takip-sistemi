"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createReport, publishReport } from "@/lib/reportJobs";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Bu işlem için yetkiniz yok.");
  return session.user;
}

const refresh = () => {
  revalidatePath("/rapor");
  revalidatePath("/panel/rapor");
};

function checkMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Geçersiz ay.");
  }
}

/** "Rapor oluştur": seçilen müşteri ve ay için raporu kaydeder (taslak; müşteri henüz görmez). */
export async function generateClientReport(clientId: string, year: number, month: number) {
  const user = await requireAdmin();
  checkMonth(year, month);
  const id = await createReport(clientId, year, month, "MANUAL", user.name ?? null);
  refresh();
  return id;
}

/** Taslak raporu müşteri paneline gönderir ve müşteriye bildirim yollar. */
export async function sendClientReport(reportId: string) {
  await requireAdmin();
  await publishReport(reportId);
  refresh();
}

export async function deleteClientReport(reportId: string) {
  await requireAdmin();
  await prisma.clientReport.delete({ where: { id: reportId } }).catch(() => null);
  refresh();
}

/** Ay sonu otomatik rapor: seçili müşteriler her ayın 1'inde önceki ayın raporunu müşteri panelinden alır. */
export async function setAutoMonthlyReport(clientId: string, on: boolean) {
  await requireAdmin();
  await prisma.client.update({ where: { id: clientId }, data: { autoMonthlyReport: on, autoReportSince: on ? new Date() : null } });
  refresh();
}
