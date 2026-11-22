import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

// Çalıştırılabilir/betik dosyaları engellenir (kötü amaçlı yazılım riski);
// döküman, görsel, video, arşiv gibi diğer tüm formatlara izin verilir.
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".msi", ".msix", ".appx", ".bat", ".cmd", ".com", ".scr", ".pif",
  ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1", ".ps1xml", ".psc1",
  ".psd1", ".psm1", ".sh", ".bash", ".zsh", ".py", ".pyc", ".pyw", ".rb",
  ".php", ".php3", ".php4", ".php5", ".phtml", ".jar", ".jnlp", ".apk",
  ".ipa", ".app", ".deb", ".rpm", ".dmg", ".pkg", ".dll", ".sys", ".drv",
  ".cpl", ".gadget", ".hta", ".lnk", ".reg", ".scf", ".url", ".action",
  ".workflow", ".command",
]);

function assertSafeExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(
      "Bu dosya türü güvenlik nedeniyle desteklenmiyor (çalıştırılabilir/betik dosyaları yasak)."
    );
  }
}

function assertSizeLimit(size: number) {
  const maxBytes = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 500) * 1024 * 1024;
  if (size > maxBytes) {
    throw new Error(
      `Dosya boyutu izin verilen sınırı (${process.env.MAX_UPLOAD_SIZE_MB ?? 500}MB) aşıyor.`
    );
  }
}

/** İş eki / teslim dosyası kuralları: çalıştırılabilir dosyalar yasak, boyut sınırı (MAX_UPLOAD_SIZE_MB). */
export function validateUploadFile(file: File) {
  assertSafeExtension(file.name);
  assertSizeLimit(file.size);
}

/**
 * Dosyayı yapılandırılan sürücüye kaydeder. Şimdilik sadece "local" destekleniyor;
 * VPS aşamasında STORAGE_DRIVER=s3 ile bu fonksiyonun gövdesi değişecek, çağıran
 * kod (görev formu) değişmeyecek.
 */
export async function saveTaskFile(file: File) {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    throw new Error(`Desteklenmeyen STORAGE_DRIVER: ${driver}`);
  }
  assertSafeExtension(file.name);
  assertSizeLimit(file.size);

  const dir = path.resolve(process.cwd(), UPLOAD_DIR, "tasks");
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name);
  const key = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, key), buffer);

  return {
    url: `/api/uploads/tasks/${key}`,
    name: file.name,
    size: file.size,
  };
}

/**
 * Çalışanın tamamladığı işi teslim etmek için yüklediği dosya. Ayrı bir
 * klasörde tutulur ki indirildiğinde veya süresi dolduğunda (bkz.
 * src/instrumentation.ts) sadece bu klasördeki dosyalar temizlensin, görev
 * oluştururken eklenen dosyalar etkilenmesin.
 */
export async function saveSubmissionFile(file: File) {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    throw new Error(`Desteklenmeyen STORAGE_DRIVER: ${driver}`);
  }
  assertSafeExtension(file.name);
  assertSizeLimit(file.size);

  const dir = path.resolve(process.cwd(), UPLOAD_DIR, "submissions");
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name);
  const key = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, key), buffer);

  return {
    url: `/api/uploads/submissions/${key}`,
    name: file.name,
    size: file.size,
  };
}

const ALLOWED_SHARE_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_SHARE_IMAGE_BYTES = 25 * 1024 * 1024;

/** Paylaşım Takvimi görseli. Dosya adı uzantısına değil, doğrulanmış MIME türüne göre
 * uzantılandırılır; böylece yüklenen dosya adı ne olursa olsun sadece görsel olarak servis edilir. */
export function validateShareImage(file: File) {
  const ext = ALLOWED_SHARE_IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Sadece PNG, JPEG, WEBP veya GIF görsel yükleyebilirsiniz.");
  if (file.size > MAX_SHARE_IMAGE_BYTES) throw new Error("Görsel boyutu 25MB'ı aşamaz.");
  return ext;
}

const ALLOWED_SHARE_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** Paylaşım takvimi dosyası: görsel (25MB) ya da video (MAX_UPLOAD_SIZE_MB, MP4/MOV/WEBM). */
export function validateShareMedia(file: File): "IMAGE" | "VIDEO" {
  if (file.type.startsWith("video/")) {
    if (!ALLOWED_SHARE_VIDEO_TYPES.has(file.type)) throw new Error("Video MP4, MOV veya WEBM biçiminde olmalı.");
    assertSizeLimit(file.size);
    return "VIDEO";
  }
  validateShareImage(file);
  return "IMAGE";
}

export async function saveShareImage(file: File) {
  const ext = validateShareImage(file);

  const dir = path.resolve(process.cwd(), UPLOAD_DIR, "share");
  await mkdir(dir, { recursive: true });

  const key = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, key), Buffer.from(await file.arrayBuffer()));

  return { url: `/api/uploads/share/${key}`, name: file.name };
}

/** Bir /api/uploads/... URL'sinden fiziksel dosyayı diskten siler. Dosya zaten
 * yoksa (daha önce silinmiş) sessizce geçer. */
export async function deleteUploadedFile(url: string) {
  const match = url.match(/^\/api\/uploads\/(tasks|submissions|avatars|share)\/([^/]+)$/);
  if (!match) return;
  const [, folder, key] = match;
  const filePath = path.resolve(process.cwd(), UPLOAD_DIR, folder, key);
  try {
    await unlink(filePath);
  } catch {
    // dosya zaten yoksa sorun değil
  }
}

const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function saveAvatarFile(file: File) {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error("Sadece PNG, JPEG veya WEBP resim yükleyebilirsiniz.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Resim boyutu 5MB'ı aşamaz.");
  }

  const dir = path.resolve(process.cwd(), UPLOAD_DIR, "avatars");
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name) || ".jpg";
  const key = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, key), buffer);

  return { url: `/api/uploads/avatars/${key}` };
}
