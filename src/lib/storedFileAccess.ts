import type { StoredFile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { canViewShareCalendar, getShareAccess } from "@/lib/shareCalendar";
import { canManageClientJobs, getClientScope, inClientScope } from "@/lib/clientAccess";
import { canUseProposals } from "@/lib/proposalAccess";

/** Müşteri hesabı: sadece kendi müşterisine ait ve kendisine gösterilen dosyalar
 * (kendi talep/içerik ekleri, kendi paylaşım takvimi görselleri, kendi talebinden doğan işin eki). */
async function canClientAccessFile(userId: string, file: StoredFile): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, isDeleted: true, clientId: true, clientAccount: { select: { isActive: true } } },
  });
  if (!u || !u.isActive || u.isDeleted || !u.clientId || !u.clientAccount?.isActive) return false;
  const clientId = u.clientId;
  // Kendi talep / içerik dosyaları (referanslar, metne konan görseller).
  if (file.clientId === clientId && (file.kind === "REQUEST" || file.kind === "CONTENT")) return true;
  // Kendi paylaşım takvimindeki görseller.
  const shareImage = await prisma.sharePostImage.count({
    where: { url: `/api/files/${file.id}`, post: { clientId } },
  });
  if (shareImage > 0) return true;
  // Ekibin kendisine sunduğu tamamlanan işler (içerik listesi / talepler).
  const delivery = await prisma.deliveryFile.count({
    where: {
      url: `/api/files/${file.id}`,
      OR: [{ contentItem: { clientId } }, { request: { clientId } }],
    },
  });
  return delivery > 0;
}

/** Drive'daki bir dosyayı kim görebilir/indirebilir.
 * Admin hepsini; paylaşım takvimi yetkisi olanlar takvimdeki (referans verilen) dosyaları görür. */
export async function canAccessStoredFile(user: SessionUser, file: StoredFile): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "CLIENT") return canClientAccessFile(user.id, file);

  // Teklifler sayfasındaki teklif / rapor dosyaları: sadece sayfayı kullanabilenler.
  if (file.kind === "PROPOSAL") return canUseProposals(user);

  // Paylaşım takvimindeki dosyalar: takvim yetkisi olan, sadece sorumlu olduğu müşterilerinkini görür.
  if (canViewShareCalendar(await getShareAccess(user))) {
    const scope = await getClientScope(user);
    const fileUrl = `/api/files/${file.id}`;
    if (scope === null) {
      if (file.kind === "SHARE" || (await prisma.sharePostImage.count({ where: { url: fileUrl } })) > 0) return true;
    } else if (
      (file.kind === "SHARE" && inClientScope(scope, file.clientId)) ||
      (await prisma.sharePost.count({
        where: { clientId: { in: scope }, OR: [{ images: { some: { url: fileUrl } } }, { coverUrl: fileUrl }] },
      })) > 0
    ) {
      return true;
    }
  }

  // Müşteri talebinden doğan işin referans dosyaları: süpervizör, işi yapan ve işi oluşturan görebilir.
  if (file.kind === "REQUEST") {
    const ref = await prisma.clientRequestFile.findFirst({
      where: { url: `/api/files/${file.id}` },
      select: { request: { select: { task: { select: { assignedToId: true } } } } },
    });
    if (ref) {
      if (user.role === "SUPERVISOR") return true;
      if (ref.request.task?.assignedToId === user.id) return true;
    }
  }

  // İş kartındaki revize çizimleri (müşteri ya da ekip revizesi): süpervizör, işi yapan, işi oluşturan
  // ve müşterinin sorumlusu görebilir.
  const revisionFile = await prisma.taskRevisionFile.findFirst({
    where: { url: `/api/files/${file.id}` },
    select: { task: { select: { assignedToId: true, createdById: true, clientId: true } } },
  });
  if (revisionFile) {
    const t = revisionFile.task;
    if (user.role === "SUPERVISOR") return true;
    if (t.assignedToId === user.id || t.createdById === user.id) return true;
    if (t.clientId && (await canManageClientJobs(user, t.clientId))) return true;
  }

  // Müşteri talebi / içerik eki: müşterinin sorumlusu ya da içerik yetkisi olan ekip üyesi görebilir.
  if ((file.kind === "REQUEST" || file.kind === "CONTENT") && file.clientId) {
    if (await canManageClientJobs(user, file.clientId)) return true;
    if (file.kind === "CONTENT") {
      const row = await prisma.user.findUnique({
        where: { id: user.id },
        select: { contentAccess: true, isActive: true, isDeleted: true },
      });
      if (row?.contentAccess && row.isActive && !row.isDeleted) return true;
    }
  }

  // Müşteriye sunulan tamamlanan iş (içerik listesi / talep): müşterinin sorumlusu ya da içerik yetkisi olan ekip üyesi görebilir.
  const url = `/api/files/${file.id}`;
  const delivery = await prisma.deliveryFile.findFirst({
    where: { url },
    select: { contentItem: { select: { clientId: true } }, request: { select: { clientId: true } } },
  });
  const deliveryClientId = delivery?.contentItem?.clientId ?? delivery?.request?.clientId;
  if (deliveryClientId) {
    if (await canManageClientJobs(user, deliveryClientId)) return true;
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { contentAccess: true, isActive: true, isDeleted: true },
    });
    if (row?.contentAccess && row.isActive && !row.isDeleted) return true;
  }

  // İş eki / çalışan teslimi: süpervizör, işi yapan, işi oluşturan ve müşterinin sorumlusu görebilir.
  const [attached, attachment, submission] = await Promise.all([
    prisma.task.findFirst({
      where: { fileUrl: url },
      select: { assignedToId: true, createdById: true, clientId: true },
    }),
    prisma.taskAttachment.findFirst({
      where: { fileUrl: url },
      select: { task: { select: { assignedToId: true, createdById: true, clientId: true } } },
    }),
    prisma.taskSubmission.findFirst({
      where: { fileUrl: url },
      select: { task: { select: { assignedToId: true, createdById: true, clientId: true } } },
    }),
  ]);
  const task = attached ?? attachment?.task ?? submission?.task;
  if (task) {
    if (user.role === "SUPERVISOR") return true;
    if (task.assignedToId === user.id || task.createdById === user.id) return true;
    if (task.clientId && (await canManageClientJobs(user, task.clientId))) return true;
  }

  return false;
}
