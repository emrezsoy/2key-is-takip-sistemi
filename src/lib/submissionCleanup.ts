import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";

const EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

/** İndirilmeden 3 günü geçen teslim dosyalarını VPS'ten siler; sadece dosya
 * adı geçmiş kaydı olarak kalır. Google Drive'daki (/api/files/...) dosyalara dokunulmaz, kalıcıdır. */
export async function cleanupExpiredSubmissions() {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const expired = await prisma.taskSubmission.findMany({
    where: { fileUrl: { startsWith: "/api/uploads/" }, uploadedAt: { lt: cutoff } },
    select: { id: true, fileUrl: true },
  });

  for (const submission of expired) {
    if (!submission.fileUrl) continue;
    await deleteUploadedFile(submission.fileUrl);
    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: { fileUrl: null },
    });
  }

  return expired.length;
}
