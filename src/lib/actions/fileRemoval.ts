"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageClientJobs } from "@/lib/clientAccess";
import { getPortalUser } from "@/lib/clientPortal";
import { requireClientSender } from "@/lib/sendAccess";
import { deleteUploadedFile } from "@/lib/storage";
import type { DeliveryTarget } from "@/lib/actions/deliveries";

// Yanlış yüklenen dosyaların silinmesi. Drive'daki dosya kalıcı arşivde kalır; kayıt işten / satırdan ayrılır.
// Eski sunucu dosyaları (/api/uploads/...) diskten de silinir.

const MAX_IDS = 100;

function cleanIds(ids: string[]) {
  const unique = [...new Set(ids.filter((i) => typeof i === "string" && i))];
  if (unique.length === 0) throw new Error("Silinecek dosya seçilmedi.");
  if (unique.length > MAX_IDS) throw new Error("Tek seferde çok fazla dosya seçildi.");
  return unique;
}

function refreshAll() {
  revalidatePath("/");
  revalidatePath("/talepler");
  revalidatePath("/panel/talepler");
  revalidatePath("/panel/icerik");
  revalidatePath("/musteriler/[id]/icerik", "page");
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Bu işlem için yetkiniz yok.");
  return session.user;
}

/** Teslim edilen dosyaları siler: admin, müşterinin sorumlusu ya da (iş bitmediyse) işe atanan kişi. */
export async function deleteSubmissionFiles(taskId: string, ids: string[]) {
  const user = await requireStaff();
  const fileIds = cleanIds(ids);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, clientId: true, status: true, assignedToId: true },
  });
  if (!task) throw new Error("İş bulunamadı.");
  const allowed =
    (await canManageClientJobs(user, task.clientId)) ||
    (task.assignedToId === user.id && task.status !== "DONE");
  if (!allowed) throw new Error("Teslim dosyalarını silme yetkiniz yok.");

  const rows = await prisma.taskSubmission.findMany({ where: { taskId, id: { in: fileIds } } });
  if (rows.length === 0) throw new Error("Dosya bulunamadı.");
  await prisma.taskSubmission.deleteMany({ where: { taskId, id: { in: rows.map((r) => r.id) } } });
  await Promise.all(rows.map((r) => (r.fileUrl ? deleteUploadedFile(r.fileUrl) : null)));

  await prisma.activity.create({
    data: {
      userId: user.id,
      taskId,
      message:
        rows.length === 1
          ? `"${task.title}" işinden teslim dosyasını sildi: ${rows[0].fileName}`
          : `"${task.title}" işinden ${rows.length} teslim dosyasını sildi`,
    },
  });
  refreshAll();
  return rows.length;
}

/** İşin referans dosyalarını siler (admin ve müşteri sorumlusu; iş tamamlanmadıysa). `legacy` = eski tekil dosya eki. */
export async function deleteTaskReferenceFiles(taskId: string, ids: string[], legacy = false) {
  const user = await requireStaff();
  const fileIds = ids.length === 0 && legacy ? [] : cleanIds(ids);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, clientId: true, status: true, fileUrl: true },
  });
  if (!task) throw new Error("İş bulunamadı.");
  if (!(await canManageClientJobs(user, task.clientId))) throw new Error("Referans dosyalarını silme yetkiniz yok.");
  if (task.status === "DONE") throw new Error("Tamamlanan işin dosyaları silinemez.");

  const rows = await prisma.taskAttachment.findMany({ where: { taskId, id: { in: fileIds } } });
  let count = rows.length;
  if (rows.length > 0) {
    await prisma.taskAttachment.deleteMany({ where: { taskId, id: { in: rows.map((r) => r.id) } } });
    await Promise.all(rows.map((r) => deleteUploadedFile(r.fileUrl)));
  }
  if (legacy && task.fileUrl) {
    await prisma.task.update({ where: { id: taskId }, data: { fileUrl: null, fileName: null, fileSize: null } });
    await deleteUploadedFile(task.fileUrl);
    count += 1;
  }
  if (count === 0) throw new Error("Dosya bulunamadı.");

  await prisma.activity.create({
    data: { userId: user.id, taskId, message: `"${task.title}" işinden ${count} referans dosyasını sildi` },
  });
  refreshAll();
  return count;
}

/** Müşteri talebinin referans dosyalarını siler.
 * Müşteri: sadece kendi talebinin, henüz işe alınmamış (bekleyen) dosyalarını. Ekip: admin / müşterinin sorumlusu. */
export async function deleteRequestFiles(requestId: string, ids: string[]) {
  const fileIds = cleanIds(ids);
  const req = await prisma.clientRequest.findUnique({
    where: { id: requestId },
    select: { id: true, clientId: true, status: true, taskId: true },
  });
  if (!req) throw new Error("Talep bulunamadı.");

  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  if (session.user.role === "CLIENT") {
    const portal = await getPortalUser();
    if (!portal || portal.clientId !== req.clientId) throw new Error("Bu işlem için yetkiniz yok.");
    if (req.status !== "PENDING" || req.taskId) {
      throw new Error("Talebiniz işleme alındığı için dosyalar artık silinemiyor. Gerekirse ekibimizle iletişime geçin.");
    }
  } else if (!(await canManageClientJobs(session.user, req.clientId))) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }

  const rows = await prisma.clientRequestFile.findMany({ where: { requestId, id: { in: fileIds } } });
  if (rows.length === 0) throw new Error("Dosya bulunamadı.");
  await prisma.clientRequestFile.deleteMany({ where: { requestId, id: { in: rows.map((r) => r.id) } } });
  await Promise.all(rows.map((r) => deleteUploadedFile(r.url)));
  refreshAll();
  return rows.length;
}

/** Ekip: "Tamamlanan" sütunundaki teslim dosyalarından yanlış olanları siler. Hiç dosya kalmazsa teslim kaldırılır. */
export async function deleteDeliveryFiles(target: DeliveryTarget, ids: string[]) {
  const fileIds = cleanIds(ids);
  const owner =
    target.type === "item"
      ? await prisma.contentItem.findUnique({ where: { id: target.id }, select: { clientId: true } })
      : await prisma.clientRequest.findUnique({ where: { id: target.id }, select: { clientId: true } });
  if (!owner) throw new Error(target.type === "item" ? "İçerik bulunamadı." : "Talep bulunamadı.");
  await requireClientSender(owner.clientId);

  const where = target.type === "item" ? { contentItemId: target.id } : { requestId: target.id };
  const rows = await prisma.deliveryFile.findMany({ where: { ...where, id: { in: fileIds } }, select: { id: true } });
  if (rows.length === 0) throw new Error("Dosya bulunamadı.");
  await prisma.deliveryFile.deleteMany({ where: { ...where, id: { in: rows.map((r) => r.id) } } });

  const left = await prisma.deliveryFile.findMany({ where, orderBy: { position: "asc" }, select: { id: true } });
  if (left.length === 0) {
    const reset = { deliveryStatus: null, deliveredAt: null, deliveredByName: null, reviewedAt: null, reviewedByName: null };
    if (target.type === "item") await prisma.contentItem.update({ where: { id: target.id }, data: reset });
    else await prisma.clientRequest.update({ where: { id: target.id }, data: reset });
  } else {
    await prisma.$transaction(left.map((f, position) => prisma.deliveryFile.update({ where: { id: f.id }, data: { position } })));
  }
  refreshAll();
  return rows.length;
}
