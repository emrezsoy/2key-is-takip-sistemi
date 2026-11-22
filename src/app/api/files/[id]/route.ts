import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { downloadFromDrive, getDriveConfig } from "@/lib/drive";
import { canAccessStoredFile } from "@/lib/storedFileAccess";

// Tarayıcıda doğrudan gösterilebilecek (güvenli) türler; geri kalanı indirme olarak sunulur.
const INLINE_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime)|application\/pdf)$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Yetkisiz", { status: 401 });

  const { id } = await params;
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse("Dosya bulunamadı", { status: 404 });
  if (!(await canAccessStoredFile(session.user, file))) {
    return new NextResponse("Yetkisiz", { status: 403 });
  }

  // Önbelleğe izin verilir ama her kullanımda yetki yeniden kontrol edilir ("no-cache" + ETag):
  // aynı tarayıcıda hesap değişse bile önceki kullanıcının dosyası yetkisiz görünmez.
  // Dosyalar değişmediği için ETag eşleşirse Drive'a hiç gitmeden 304 döner.
  const etag = `"${file.id}-${file.size}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }

  const config = await getDriveConfig().catch(() => null);
  if (!config) return new NextResponse("Drive bağlantısı yok", { status: 503 });

  const upstream = await downloadFromDrive(config, file.driveFileId, req.headers.get("range"));
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Dosya Drive'dan alınamadı", { status: upstream.status === 404 ? 404 : 502 });
  }

  // ?download=1: görsel/video bile olsa indirme olarak sunulur ("İndir" düğmesi).
  const forceDownload = new URL(req.url).searchParams.get("download") === "1";
  const safeType = INLINE_TYPES.test(file.mimeType);
  const inline = safeType && !forceDownload;
  const headers = new Headers({
    "Content-Type": safeType ? file.mimeType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    ETag: etag,
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
