"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageClientJobs } from "@/lib/clientAccess";
import { loadMonthExport } from "@/lib/monthExport";

export type MonthExportPreview = {
  clientName: string;
  jobs: { title: string; folder: string; fileCount: number }[];
  totalFiles: number;
};

/** Toplu indirme penceresi: seçilen ayda hangi işlerin kaç dosyasının ineceğini önceden gösterir. */
export async function previewMonthExport(clientId: string, year: number, month: number): Promise<MonthExportPreview> {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Bu işlem için yetkiniz yok.");
  if (!(await canManageClientJobs(session.user, clientId))) throw new Error("Bu müşteri için yetkiniz yok.");
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Geçersiz ay.");
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) throw new Error("Müşteri bulunamadı.");

  const jobs = await loadMonthExport(clientId, year, month);
  return {
    clientName: client.name,
    jobs: jobs.map((j) => ({ title: j.title, folder: j.folder, fileCount: j.files.length })),
    totalFiles: jobs.reduce((n, j) => n + j.files.length, 0),
  };
}
