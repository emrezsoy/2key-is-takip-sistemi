import type { StoredFile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessStoredFile } from "@/lib/storedFileAccess";

/** Bir gönderimde (paylaşım, teslim) en fazla dosya sayısı. */
export const MAX_SEND_FILES = 20;

export const MEDIA_MIME = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|quicktime|webm))$/;
export const fileIdFromUrl = (url: string) => url.match(/^\/api\/files\/([A-Za-z0-9]+)$/)?.[1] ?? null;
export const isVideoMime = (mime: string) => mime.startsWith("video/");

/** `/api/files/<id>` adreslerini Drive kayıtlarına çevirir; medya türü ve erişim yetkisini denetler. */
export async function resolveMediaFiles(user: Parameters<typeof canAccessStoredFile>[0], fileUrls: string[]) {
  const ids = [...new Set(fileUrls.map(fileIdFromUrl).filter((v): v is string => !!v))];
  if (ids.length === 0) throw new Error("Gönderilecek görsel seçilmedi.");
  if (ids.length > MAX_SEND_FILES) throw new Error(`En fazla ${MAX_SEND_FILES} görsel gönderilebilir.`);

  const files = await prisma.storedFile.findMany({ where: { id: { in: ids } } });
  const byId = new Map(files.map((f) => [f.id, f]));
  const ordered = ids.map((id) => byId.get(id));
  for (const f of ordered) {
    if (!f) throw new Error("Seçilen dosyalardan biri bulunamadı.");
    if (!MEDIA_MIME.test(f.mimeType)) {
      throw new Error(`"${f.name}" görsel (PNG/JPEG/WEBP/GIF) ya da video (MP4/MOV/WEBM) değil.`);
    }
    if (!(await canAccessStoredFile(user, f))) throw new Error("Bu dosyaya erişim yetkin yok.");
  }
  return { ids, images: ordered as StoredFile[] };
}

/** İşin çalışan tarafından TESLİM edilen dosyaları dışındakiler (referanslar vb.) gönderilemez. */
export async function assertTaskDelivered(taskId: string, ids: string[]) {
  const delivered = await prisma.taskSubmission.findMany({
    where: { taskId, fileUrl: { in: ids.map((id) => `/api/files/${id}`) } },
    select: { fileUrl: true },
  });
  const deliveredUrls = new Set(delivered.map((d) => d.fileUrl));
  for (const id of ids) {
    if (!deliveredUrls.has(`/api/files/${id}`)) {
      throw new Error("Sadece işin teslim dosyaları gönderilebilir.");
    }
  }
}
