import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewShareCalendar, getShareAccess } from "@/lib/shareCalendar";
import { getClientScope } from "@/lib/clientAccess";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Yetkisiz", { status: 401 });
  const { key } = await params;
  if (session.user.role === "CLIENT") {
    // Müşteri hesabı: sadece kendi müşterisinin paylaşımlarındaki görsel.
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { clientId: true, isActive: true } });
    const owns =
      !!me?.isActive &&
      !!me.clientId &&
      (await prisma.sharePostImage.count({
        where: { url: `/api/uploads/share/${key}`, post: { clientId: me.clientId } },
      })) > 0;
    if (!owns) return new NextResponse("Yetkisiz", { status: 403 });
  } else if (!canViewShareCalendar(await getShareAccess(session.user))) {
    return new NextResponse("Yetkisiz", { status: 403 });
  } else {
    // Admin dışındakiler sadece sorumlu oldukları müşterilerin paylaşım görsellerini görür.
    const scope = await getClientScope(session.user);
    if (
      scope !== null &&
      (await prisma.sharePost.count({
        where: {
          clientId: { in: scope },
          OR: [{ images: { some: { url: `/api/uploads/share/${key}` } } }, { coverUrl: `/api/uploads/share/${key}` }],
        },
      })) === 0
    ) {
      return new NextResponse("Yetkisiz", { status: 403 });
    }
  }

  if (key.includes("..") || key.includes("/") || key.includes("\\")) {
    return new NextResponse("Geçersiz dosya", { status: 400 });
  }

  const filePath = path.resolve(process.cwd(), UPLOAD_DIR, "share", key);
  const contentType = CONTENT_TYPES[path.extname(key).toLowerCase()];
  if (!contentType) return new NextResponse("Geçersiz dosya", { status: 400 });

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return new NextResponse("Dosya bulunamadı", { status: 404 });
  }
}
