import { prisma } from "@/lib/prisma";
import { MONTHS } from "@/lib/format";
import {
  DriveError,
  ensureClientMonthFolder,
  ensureProposalMonthFolder,
  getDriveConfig,
  uploadToFolder,
  type DriveConfig,
} from "@/lib/drive";

export type StoredKind = "SHARE" | "TASK" | "SUBMISSION" | "REQUEST" | "CONTENT" | "PROPOSAL";

export type DriveUploadContext = {
  /** Müşterisiz işler "Müşterisiz" klasörüne gider. */
  client: { id: string | null; name: string };
  kind: StoredKind;
  uploadedById?: string | null;
  /** Teklifler sayfası: "Teklifler/<Ay Yıl>" klasörüne yükler (müşteri klasörü kullanılmaz). Ay, teklif tarihinden gelir. */
  proposalMonth?: { key: string; label: string };
};

export type StoredUpload = { id: string; url: string; name: string };

/** Yükleme ayı (Türkiye saatine göre): klasör adı "Kasım 2026" gibi olur. */
export function uploadMonth(now = new Date()) {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
  const [year, month] = iso.split("-").map(Number);
  return { iso, key: iso.slice(0, 7), label: `${MONTHS[month - 1]} ${year}` };
}

export const storedFileUrl = (id: string) => `/api/files/${id}`;

const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 && i > name.length - 8 ? name.slice(i) : "";
};

/** Drive bağlı mı? Bağlıysa yapılandırmayı döner. */
export async function driveIfConfigured(): Promise<DriveConfig | null> {
  try {
    return await getDriveConfig();
  } catch {
    return null;
  }
}

/** Dosyaları Drive'da "<Müşteri>/<Ay Yıl>" klasörüne yükler ve veritabanına kaydeder.
 * `nameFor(file, i)` Drive'daki dosya adını belirler (uzantı otomatik eklenir). */
export async function saveFilesToDrive(
  config: DriveConfig,
  files: File[],
  ctx: DriveUploadContext,
  nameFor: (file: File, index: number) => string
): Promise<StoredUpload[]> {
  const month = ctx.proposalMonth ?? uploadMonth();

  const run = async (forceRefresh: boolean) => {
    // Klasör bir kez hazırlanır; dosyalar sonra paralel yüklenir (çift klasör oluşmasın).
    const folderId = ctx.proposalMonth
      ? await ensureProposalMonthFolder(config, month.key, month.label, forceRefresh)
      : await ensureClientMonthFolder(config, ctx.client, month.key, month.label, forceRefresh);
    return Promise.all(
      files.map(async (file, i) => {
        const ext = extOf(file.name);
        const base = nameFor(file, i);
        const info = await uploadToFolder(
          config,
          folderId,
          base.endsWith(ext) ? base : `${base}${ext}`,
          file.type || "application/octet-stream",
          file
        );
        const stored = await prisma.storedFile.create({
          data: {
            driveFileId: info.id,
            name: info.name,
            mimeType: info.mimeType || file.type || "application/octet-stream",
            size: info.size,
            clientId: ctx.client.id,
            kind: ctx.kind,
            folderPath: ctx.proposalMonth ? `Teklifler / ${month.label}` : `${ctx.client.name} / ${month.label}`,
            uploadedById: ctx.uploadedById ?? null,
          },
        });
        return { id: stored.id, url: storedFileUrl(stored.id), name: info.name };
      })
    );
  };

  try {
    return await run(false);
  } catch (e) {
    // Klasör Drive'dan elle silinmişse önbellek geçersizdir: bir kez yeniden kurup tekrar dene.
    if (e instanceof DriveError && /not found/i.test(e.message)) return run(true);
    throw e;
  }
}
