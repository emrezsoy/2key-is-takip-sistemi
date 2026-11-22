import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

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

  const filePath = path.resolve(process.cwd(), UPLOAD_DIR, "avatars", key);

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(key).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Dosya bulunamadı", { status: 404 });
  }
}
