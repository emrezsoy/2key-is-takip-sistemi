import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Yetkisiz", { status: 401 });
  }

  const { key } = await params;
  if (key.includes("..") || key.includes("/") || key.includes("\\")) {
    return new NextResponse("Geçersiz dosya", { status: 400 });
  }

  const url = `/api/uploads/submissions/${key}`;
  const submission = await prisma.taskSubmission.findFirst({
    where: { fileUrl: url },
    include: { task: { select: { assignedToId: true } } },
  });
  if (!submission) {
    return new NextResponse(
      "Dosya artık mevcut değil (indirilmiş ya da süresi dolmuş olabilir).",
      { status: 404 }
    );
  }

  const filePath = path.resolve(process.cwd(), UPLOAD_DIR, "submissions", key);

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return new NextResponse("Dosya bulunamadı", { status: 404 });
  }

  // Yükleyen kişi (çalışan) dışındaki biri -yani "karşı taraf"- indirdiğinde
  // dosya VPS'ten kalıcı olarak silinir; sadece dosya adı geçmişte kalır.
  if (submission.task.assignedToId !== session.user.id) {
    await deleteUploadedFile(url);
    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: { fileUrl: null, downloadedAt: new Date() },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        submission.fileName
      )}"`,
    },
  });
}
