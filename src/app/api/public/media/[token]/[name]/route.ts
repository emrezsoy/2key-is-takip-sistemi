import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadFromDrive, getDriveConfig } from "@/lib/drive";
import { verifyPublicMediaToken } from "@/lib/publicMedia";

// Meta'nın (Instagram / Facebook) paylaşılacak dosyayı indirdiği, giriş gerektirmeyen adres.
// Sadece imzalı ve süresi dolmamış bağlantılar çalışır (bkz. src/lib/publicMedia.ts); bağlantı tek bir dosyaya aittir.
export const maxDuration = 300;

/** Instagram sadece JPEG kabul eder: PNG/WEBP görseller beyaz zemin üzerinde JPEG'e çevrilir (en fazla 1440 px genişlik). */
async function toJpeg(input: Buffer) {
  const sharp = (await import("sharp")).default;
  return sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 1440, withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string; name: string }> }) {
  const { token } = await params;
  const parsed = verifyPublicMediaToken(token);
  if (!parsed) return new NextResponse("Bağlantı geçersiz ya da süresi dolmuş", { status: 403 });

  const file = await prisma.storedFile.findUnique({ where: { id: parsed.fileId } });
  if (!file) return new NextResponse("Dosya bulunamadı", { status: 404 });

  const config = await getDriveConfig().catch(() => null);
  if (!config) return new NextResponse("Drive bağlantısı yok", { status: 503 });

  if (parsed.mode === "j") {
    if (!file.mimeType.startsWith("image/")) return new NextResponse("Görsel değil", { status: 415 });
    const upstream = await downloadFromDrive(config, file.driveFileId);
    if (!upstream.ok) return new NextResponse("Dosya Drive'dan alınamadı", { status: 502 });
    const jpeg = await toJpeg(Buffer.from(await upstream.arrayBuffer()));
    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "private, max-age=600",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const upstream = await downloadFromDrive(config, file.driveFileId, req.headers.get("range"));
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Dosya Drive'dan alınamadı", { status: upstream.status === 404 ? 404 : 502 });
  }
  const headers = new Headers({
    "Content-Type": file.mimeType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=600",
    "X-Robots-Tag": "noindex",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
