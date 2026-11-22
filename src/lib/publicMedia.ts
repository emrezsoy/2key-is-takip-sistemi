import crypto from "node:crypto";

// Meta (Instagram / Facebook) paylaşılacak görsel ve videoyu bizim sunucudan kendisi indirir; bunun için dosyanın
// giriş gerektirmeyen bir adresi olmalı. Burada sadece o dosya için, kısa süreli ve imzalı bir adres üretilir.

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function secret() {
  const s = process.env.AUTH_SECRET ?? process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!s) throw new Error("AUTH_SECRET tanımlı değil.");
  return s;
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

/** `/api/files/<id>` adresinden Drive'daki dosya kimliği; başka bir adresse null. */
export function fileIdFromUrl(url: string): string | null {
  const m = /^\/api\/files\/([A-Za-z0-9_-]+)$/.exec(url);
  return m ? m[1] : null;
}

/** mode "j": JPEG'e çevrilerek (Instagram sadece JPEG kabul eder), "o": olduğu gibi. */
export type PublicMediaMode = "j" | "o";

/** Dosya için imzalı, geçici (varsayılan 6 saat) ve herkese açık adres. */
export function publicMediaUrl(fileId: string, mode: PublicMediaMode, fileName?: string, ttlHours = 6) {
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const payload = `${fileId}.${exp}.${mode}`;
  // Adresin sonundaki ad sadece uzantı içindir (Meta dosya türünü uzantıdan da anlar); imzaya dahil değildir.
  const ext = fileName?.match(/\.[A-Za-z0-9]{2,5}$/)?.[0]?.toLowerCase() ?? "";
  const name = mode === "j" ? "gorsel.jpg" : `dosya${ext}`;
  return `${APP_URL}/api/public/media/${payload}.${sign(payload)}/${name}`;
}

/** İmzayı ve süreyi doğrular. */
export function verifyPublicMediaToken(token: string): { fileId: string; mode: PublicMediaMode } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [fileId, expRaw, mode, sig] = parts;
  if (mode !== "j" && mode !== "o") return null;
  const expected = sign(`${fileId}.${expRaw}.${mode}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!Number.isFinite(Number(expRaw)) || Number(expRaw) * 1000 < Date.now()) return null;
  return { fileId, mode };
}
