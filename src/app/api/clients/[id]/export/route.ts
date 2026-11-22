import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageClientJobs } from "@/lib/clientAccess";
import { buildZipStream, loadMonthExport, safeName } from "@/lib/monthExport";
import { MONTHS } from "@/lib/format";

export const maxDuration = 600;

/** Müşterinin seçilen ayda tamamlanan işlerinin teslim dosyaları: her iş bir klasör, içinde görselleri (tek zip). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") return new NextResponse("Yetkisiz", { status: 401 });

  const { id } = await params;
  if (!(await canManageClientJobs(session.user, id))) return new NextResponse("Yetkisiz", { status: 403 });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return new NextResponse("Geçersiz ay", { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  if (!client) return new NextResponse("Müşteri bulunamadı", { status: 404 });

  const jobs = await loadMonthExport(id, year, month);
  if (jobs.length === 0) return new NextResponse("Bu ay için indirilecek dosya yok", { status: 404 });

  const fileName = `${safeName(client.name, 60)} - ${MONTHS[month - 1]} ${year}.zip`;
  return new Response(buildZipStream(jobs), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="export.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
