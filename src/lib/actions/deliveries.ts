"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePortalActor, SOCIAL_SERVICE_MESSAGE } from "@/lib/clientPortal";
import { requireClientSender, requireSender } from "@/lib/sendAccess";
import { assertTaskDelivered, isVideoMime, resolveMediaFiles } from "@/lib/mediaFiles";
import { storeClientMedias } from "@/lib/fileStore";
import { istanbulToday } from "@/lib/clientPayments";
import { notifyAdminsNewRequest } from "@/lib/clientNotify";
import { pushNotification } from "@/lib/inAppNotify";
import { parseRevisionForm, revisionDetails } from "@/lib/revisionForm";
import { REVISION_SEPARATOR, revisionStamp } from "@/lib/revisionNote";
import { notifyTaskReturnedToProgress } from "@/lib/notifications";
import type { NotificationType } from "@prisma/client";

/** Tamamlanan iş çıktısının (teslim) hedefi: içerik tablosundaki bir satır ya da bir müşteri talebi. */
export type DeliveryTarget = { type: "item"; id: string } | { type: "request"; id: string };

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const monthLabel = (year: number, month: number) => `${MONTH_NAMES[month - 1]} ${year}`;

function refresh() {
  revalidatePath("/"); // iş listesindeki "Müşteri onayladı" rozeti
  revalidatePath("/panel/icerik");
  revalidatePath("/panel/talepler");
  revalidatePath("/talepler");
  revalidatePath("/musteriler/[id]/icerik", "page");
}

async function notifyClientUsers(clientId: string, params: { title: string; message: string; url: string }) {
  const users = await prisma.user.findMany({
    where: { role: "CLIENT", clientId, isActive: true, isDeleted: false },
    select: { id: true },
  });
  await Promise.all(
    users.map((u) => pushNotification({ userId: u.id, type: "DELIVERY_READY" as NotificationType, ...params }))
  );
}

/** Müşteri onayladığında yöneticilere ve o müşterinin sorumlularına haber verir. */
async function notifyApproval(clientId: string, params: { title: string; message: string; url: string }) {
  const people = await prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      OR: [{ role: "ADMIN" }, { role: { not: "CLIENT" }, ledClients: { some: { id: clientId } } }],
    },
    select: { id: true },
  });
  await Promise.all(
    people.map((p) => pushNotification({ userId: p.id, type: "DELIVERY_APPROVED" as NotificationType, ...params }))
  );
}

// ---- Ekip tarafı: işi içerik listesine / müşteri talebine gönder ------------------------------

export type ContentTarget = { id: string; title: string; year: number; month: number; status: string | null };
export type ContentTargets = {
  clientName: string;
  items: ContentTarget[];
  /** İşin bağlı olduğu satır ("İş olarak ekle" ya da bu işin revize isteği). */
  linkedId: string | null;
  year: number;
  month: number;
};

/** "İçerik listesine gönder" penceresi için: işin müşterisinin içerik satırları (geçen aydan itibaren). */
export async function getContentTargets(taskId: string): Promise<ContentTargets> {
  await requireSender(taskId);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { clientId: true, client: { select: { name: true } }, request: { select: { contentItemId: true } } },
  });
  if (!task) throw new Error("İş bulunamadı.");
  if (!task.clientId) throw new Error("Bu işin bir müşterisi yok.");

  const today = istanbulToday();
  const since = today.month === 1 ? { y: today.year - 1, m: 12 } : { y: today.year, m: today.month - 1 };
  const linkedRow = await prisma.contentItem.findFirst({
    where: { clientId: task.clientId, OR: [{ taskId }, ...(task.request?.contentItemId ? [{ id: task.request.contentItemId }] : [])] },
    select: { id: true },
  });
  const rows = await prisma.contentItem.findMany({
    where: {
      clientId: task.clientId,
      OR: [
        { year: { gt: since.y } },
        { year: since.y, month: { gte: since.m } },
        ...(linkedRow ? [{ id: linkedRow.id }] : []),
      ],
    },
    orderBy: [{ year: "asc" }, { month: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    take: 300,
    select: { id: true, title: true, year: true, month: true, deliveryStatus: true },
  });
  return {
    clientName: task.client?.name ?? "",
    items: rows.map((r) => ({ id: r.id, title: r.title, year: r.year, month: r.month, status: r.deliveryStatus })),
    linkedId: linkedRow?.id ?? null,
    year: today.year,
    month: today.month,
  };
}

export type SendToContentInput = {
  taskId: string;
  /** Gönderilecek teslim dosyaları (`/api/files/<id>`), sıralı. */
  fileUrls: string[];
  /** Mevcut satıra gönder. */
  itemId?: string;
  /** Ya da yeni satır aç. */
  newItem?: { year: number; month: number; title?: string };
};

/** İşin teslim dosyalarını içerik tablosundaki satırın "Tamamlanan" sütununa koyar; müşteri onayına sunar.
 * Satırda önceki bir teslim varsa (ör. revize sonrası) yenisiyle değiştirilir. */
export async function sendTaskToContent(input: SendToContentInput) {
  const { user } = await requireSender(input.taskId);
  const { ids, images } = await resolveMediaFiles(user, input.fileUrls);
  await assertTaskDelivered(input.taskId, ids);

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { title: true, clientId: true, caption: true },
  });
  if (!task) throw new Error("İş bulunamadı.");
  if (!task.clientId) throw new Error("Bu işin bir müşterisi yok.");
  const clientId = task.clientId;
  const actorName = user.name ?? user.username;
  // İşin kartında yazılan caption satıra taşınır (boşsa satırdaki caption korunur).
  const caption = task.caption?.trim() ? task.caption.trim() : undefined;

  let itemId: string;
  if (input.itemId) {
    const item = await prisma.contentItem.findUnique({ where: { id: input.itemId }, select: { id: true, clientId: true } });
    if (!item || item.clientId !== clientId) throw new Error("İçerik satırı bulunamadı.");
    itemId = item.id;
  } else if (input.newItem) {
    const { year, month } = input.newItem;
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error("Geçersiz ay.");
    }
    const last = await prisma.contentItem.aggregate({ where: { clientId, year, month }, _max: { position: true } });
    const created = await prisma.contentItem.create({
      data: {
        clientId,
        year,
        month,
        title: (input.newItem.title ?? task.title).trim().slice(0, 160) || task.title.slice(0, 160),
        position: (last._max.position ?? -1) + 1,
        createdById: user.id,
        createdByName: actorName,
        taskId: input.taskId,
      },
    });
    itemId = created.id;
  } else {
    throw new Error("Bir içerik satırı seçin.");
  }

  await prisma.$transaction([
    prisma.deliveryFile.deleteMany({ where: { contentItemId: itemId } }),
    prisma.deliveryFile.createMany({
      data: images.map((f, position) => ({
        contentItemId: itemId,
        url: `/api/files/${f.id}`,
        name: f.name,
        mediaType: isVideoMime(f.mimeType) ? "VIDEO" : "IMAGE",
        position,
      })),
    }),
    prisma.contentItem.update({
      where: { id: itemId },
      data: {
        deliveryStatus: "REVIEW",
        deliveredAt: new Date(),
        deliveredByName: actorName,
        reviewedAt: null,
        reviewedByName: null,
        ...(caption ? { caption } : {}),
      },
    }),
  ]);

  const item = await prisma.contentItem.findUniqueOrThrow({ where: { id: itemId }, select: { title: true, year: true, month: true } });
  await notifyClientUsers(clientId, {
    title: "Onayınızı bekleyen içerik",
    message: `"${item.title}" içeriği hazır. İçerik panelinden onaylayabilir ya da revize isteyebilirsiniz.`,
    url: `/panel/icerik?y=${item.year}&m=${item.month}`,
  });
  refresh();
  return { itemId, title: item.title, year: item.year, month: item.month, count: images.length };
}

/** İş bir müşteri talebinden (ya da bir talebin revizesinden) geldiyse, teslimin gideceği talep. */
async function requestTargetOf(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      request: { select: { id: true, kind: true, sourceRequestId: true } },
    },
  });
  const r = task?.request;
  if (!r) return null;
  if (r.kind === "REVISION") return r.sourceRequestId ?? null;
  return r.id;
}

/** İşin teslim dosyalarını ilgili müşteri talebine koyar; müşteri talepler sayfasında onay verir ya da revize ister. */
export async function sendTaskToRequest(input: { taskId: string; fileUrls: string[] }) {
  const { user } = await requireSender(input.taskId);
  const { ids, images } = await resolveMediaFiles(user, input.fileUrls);
  await assertTaskDelivered(input.taskId, ids);

  const requestId = await requestTargetOf(input.taskId);
  if (!requestId) throw new Error("Bu iş bir müşteri talebinden gelmediği için talebe gönderilemez.");
  const req = await prisma.clientRequest.findUnique({ where: { id: requestId }, select: { id: true, title: true, clientId: true } });
  if (!req) throw new Error("Müşteri talebi bulunamadı.");
  const actorName = user.name ?? user.username;

  await prisma.$transaction([
    prisma.deliveryFile.deleteMany({ where: { requestId: req.id } }),
    prisma.deliveryFile.createMany({
      data: images.map((f, position) => ({
        requestId: req.id,
        url: `/api/files/${f.id}`,
        name: f.name,
        mediaType: isVideoMime(f.mimeType) ? "VIDEO" : "IMAGE",
        position,
      })),
    }),
    prisma.clientRequest.update({
      where: { id: req.id },
      data: {
        deliveryStatus: "REVIEW",
        deliveredAt: new Date(),
        deliveredByName: actorName,
        reviewedAt: null,
        reviewedByName: null,
      },
    }),
  ]);

  await notifyClientUsers(req.clientId, {
    title: "Talebiniz hazır",
    message: `"${req.title}" talebiniz için çalışma hazır. Talepler sayfasından onaylayabilir ya da revize isteyebilirsiniz.`,
    url: "/panel/talepler",
  });
  refresh();
  return { requestId: req.id, title: req.title, count: images.length };
}

/** Ekip: ekip içinde onaylanıp satıra konan (henüz müşteriye açılmamış) teslimi müşterinin onayına sunar. */
export async function releaseDelivery(target: DeliveryTarget) {
  if (target.type !== "item") throw new Error("Bu teslim zaten müşteride.");
  const item = await prisma.contentItem.findUnique({ where: { id: target.id }, select: { clientId: true, title: true, year: true, month: true, deliveryStatus: true } });
  if (!item) throw new Error("İçerik bulunamadı.");
  const { user } = await requireClientSender(item.clientId);
  if (item.deliveryStatus !== "DRAFT") throw new Error("Bu teslim zaten müşteriye gönderilmiş.");
  await prisma.contentItem.update({
    where: { id: target.id },
    data: { deliveryStatus: "REVIEW", deliveredAt: new Date(), deliveredByName: user.name ?? user.username },
  });
  await notifyClientUsers(item.clientId, {
    title: "Onayınızı bekleyen içerik",
    message: `"${item.title}" içeriği hazır. İçerik panelinden onaylayabilir ya da revize isteyebilirsiniz.`,
    url: `/panel/icerik?y=${item.year}&m=${item.month}`,
  });
  refresh();
}

/** Ekip: yanlış gönderilen teslimi "Tamamlanan" sütunundan kaldırır. */
export async function clearDelivery(target: DeliveryTarget) {
  if (target.type === "item") {
    const item = await prisma.contentItem.findUnique({ where: { id: target.id }, select: { clientId: true } });
    if (!item) throw new Error("İçerik bulunamadı.");
    await requireClientSender(item.clientId);
    await prisma.$transaction([
      prisma.deliveryFile.deleteMany({ where: { contentItemId: target.id } }),
      prisma.contentItem.update({
        where: { id: target.id },
        data: { deliveryStatus: null, deliveredAt: null, deliveredByName: null, reviewedAt: null, reviewedByName: null },
      }),
    ]);
  } else {
    const req = await prisma.clientRequest.findUnique({ where: { id: target.id }, select: { clientId: true } });
    if (!req) throw new Error("Talep bulunamadı.");
    await requireClientSender(req.clientId);
    await prisma.$transaction([
      prisma.deliveryFile.deleteMany({ where: { requestId: target.id } }),
      prisma.clientRequest.update({
        where: { id: target.id },
        data: { deliveryStatus: null, deliveredAt: null, deliveredByName: null, reviewedAt: null, reviewedByName: null },
      }),
    ]);
  }
  refresh();
}

/** Ekip (admin / müşteri sorumlusu) içerik listesindeki teslim için revize verir: müşteri revizesindeki gibi görselin
 * üzerine çizip not yapıştırır. Onay adımı yoktur; revize doğrudan işin kartına işlenir, iş yeniden "Devam ediyor"a döner.
 * Kartta bu revize öne çıkar, öncekiler "eski revize" olarak küçük gösterilir. Satıra bağlı iş yoksa yeni bir iş açılır. */
export async function teamReviseDelivery(itemId: string, formData: FormData) {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true, clientId: true, title: true, year: true, month: true, taskId: true, deliveryStatus: true,
      client: { select: { name: true } },
      deliveryFiles: { orderBy: { position: "asc" }, select: { mediaType: true } },
    },
  });
  if (!item) throw new Error("İçerik bulunamadı.");
  const { user } = await requireClientSender(item.clientId);
  if (!item.deliveryStatus || item.deliveryFiles.length === 0) throw new Error("Bu satırda revize verilecek bir teslim yok.");

  const { note, annotations, renamed } = parseRevisionForm(formData, item.deliveryFiles);
  const byName = user.name ?? user.username ?? "Yönetici";
  const body = revisionDetails(`İçerik listesinden: ${item.title} · ${monthLabel(item.year, item.month)}`, note, annotations, renamed.length > 0);
  const block = `[${revisionStamp()}] Yönetici revizesi (${byName})\n${body}`;

  const stored =
    renamed.length > 0
      ? await storeClientMedias(renamed, {
          client: { id: item.clientId, name: item.client.name },
          kind: "CONTENT",
          label: `Revize - ${item.title}`,
          uploadedById: user.id,
        })
      : [];

  // Satırın işi: "İş olarak ekle" / önceki revizeyle bağlanmış iş (aynı müşteriye ait olmalı); yoksa yeni iş açılır.
  const linked = item.taskId
    ? await prisma.task.findUnique({ where: { id: item.taskId }, include: { assignedTo: true } })
    : null;
  const task =
    linked && linked.clientId === item.clientId
      ? linked
      : await prisma.task.create({
          data: { title: `Revize: ${item.title}`.slice(0, 120), clientId: item.clientId, createdById: user.id, urgency: "MEDIUM" },
          include: { assignedTo: true },
        });
  const reopen = task.status === "DONE" || task.status === "PENDING_APPROVAL";
  const plain = [note, ...annotations.flatMap((a) => a.texts)].filter(Boolean).join(" · ").slice(0, 1000) || "Görsel üzerinde çizimli revize";

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: {
        revisionNote: task.revisionNote ? `${task.revisionNote}${REVISION_SEPARATOR}${block}` : block,
        ...(reopen ? { status: "IN_PROGRESS", completedAt: null } : {}),
      },
    }),
    prisma.taskRevision.create({ data: { taskId: task.id, source: "ADMIN", note: plain, byId: user.id, byName } }),
    prisma.taskRevisionFile.updateMany({ where: { taskId: task.id, archivedAt: null }, data: { archivedAt: new Date() } }),
    ...(stored.length > 0
      ? [prisma.taskRevisionFile.createMany({ data: stored.map((f, i) => ({ taskId: task.id, url: f.url, name: f.name, position: i })) })]
      : []),
    prisma.contentItem.update({
      where: { id: item.id },
      data: { taskId: task.id, deliveryStatus: "REVISION", reviewedAt: new Date(), reviewedByName: byName },
    }),
    prisma.activity.create({
      data: {
        userId: user.id,
        taskId: task.id,
        message: `İçerik listesinden "${item.title}" için revize verdi${reopen ? " (iş yeniden açıldı)" : ""}${stored.length > 0 ? ` (${stored.length} çizimli görsel)` : ""}`,
      },
    }),
  ]);

  if (task.assignedTo && task.assignedTo.id !== user.id) {
    await pushNotification({
      userId: task.assignedTo.id,
      taskId: task.id,
      type: "TASK_RETURNED",
      title: "Revize gerekiyor",
      message: `"${task.title}" işi için ${byName} içerik listesinden revize verdi.`,
    });
    if (task.assignedTo.emailNotificationsEnabled) {
      await notifyTaskReturnedToProgress({ to: task.assignedTo.email, assigneeName: task.assignedTo.fullName, taskTitle: task.title });
    }
  }
  refresh();
  return { taskId: task.id, newTask: task.id !== linked?.id };
}

// ---- Müşteri tarafı: onay / revize ------------------------------------------------------------

async function loadTargetForClient(target: DeliveryTarget, clientId: string) {
  if (target.type === "item") {
    const item = await prisma.contentItem.findFirst({
      where: { id: target.id, clientId },
      select: {
        id: true, title: true, year: true, month: true, deliveryStatus: true,
        deliveryFiles: { orderBy: { position: "asc" }, select: { mediaType: true } },
      },
    });
    if (!item) throw new Error("İçerik bulunamadı.");
    return { ...item, kind: "item" as const };
  }
  const req = await prisma.clientRequest.findFirst({
    where: { id: target.id, clientId },
    select: {
      id: true, title: true, deliveryStatus: true,
      deliveryFiles: { orderBy: { position: "asc" }, select: { mediaType: true } },
    },
  });
  if (!req) throw new Error("Talep bulunamadı.");
  return { ...req, kind: "request" as const };
}

/** Müşteri tamamlanan işi onaylar; yöneticilere bildirim gider. Onaylanan içerik buradan paylaşım takvimine gönderilebilir. */
export async function approveDelivery(target: DeliveryTarget) {
  const user = await requirePortalActor();
  if (!user.socialManaged) throw new Error(SOCIAL_SERVICE_MESSAGE);
  const row = await loadTargetForClient(target, user.clientId);
  if (row.deliveryStatus !== "REVIEW") throw new Error("Bu çalışma şu anda onaya açık değil.");

  const data = { deliveryStatus: "APPROVED", reviewedAt: new Date(), reviewedByName: user.fullName };
  if (row.kind === "item") await prisma.contentItem.update({ where: { id: row.id }, data });
  else await prisma.clientRequest.update({ where: { id: row.id }, data });

  await notifyApproval(user.clientId, {
    title: row.kind === "item" ? "Müşteri içeriği onayladı" : "Müşteri çalışmayı onayladı",
    message: `${user.clientName}: "${row.title}" onaylandı.`,
    url: row.kind === "item" ? `/musteriler/${user.clientId}/icerik?y=${row.year}&m=${row.month}` : "/talepler",
  });
  refresh();
}

/** Müşteri tamamlanan iş için revize ister (çizim, sticker not ve genel not). İstek önce yöneticiye onaya gider;
 * onaylanınca müşterinin iş listesine "Müşteri revizesi" olarak düşer. */
export async function reviseDelivery(target: DeliveryTarget, formData: FormData) {
  const user = await requirePortalActor();
  if (!user.socialManaged || !user.shareRevisionEnabled) throw new Error("Revize isteme yetkiniz yok.");
  const row = await loadTargetForClient(target, user.clientId);
  if (row.deliveryStatus !== "REVIEW") throw new Error("Bu çalışma şu anda onaya açık değil.");

  const { note, annotations, renamed } = parseRevisionForm(formData, row.deliveryFiles);
  const title = `Revize: ${row.title}`.slice(0, 120);
  const headline =
    row.kind === "item"
      ? `İçerik: ${row.title} · ${monthLabel(row.year, row.month)}`
      : `Talep: ${row.title}`;

  const stored =
    renamed.length > 0
      ? await storeClientMedias(renamed, {
          client: { id: user.clientId, name: user.clientName },
          kind: "REQUEST",
          label: `Revize - ${row.title}`,
          uploadedById: user.id,
        })
      : [];

  await prisma.$transaction([
    prisma.clientRequest.create({
      data: {
        clientId: user.clientId,
        createdById: user.id,
        title,
        details: revisionDetails(headline, note, annotations, renamed.length > 0),
        urgency: "MEDIUM",
        kind: "REVISION",
        ...(row.kind === "item" ? { contentItemId: row.id } : { sourceRequestId: row.id }),
        files: { create: stored.map((f, i) => ({ url: f.url, name: f.name, position: i })) },
      },
    }),
    row.kind === "item"
      ? prisma.contentItem.update({
          where: { id: row.id },
          data: { deliveryStatus: "REVISION", reviewedAt: new Date(), reviewedByName: user.fullName },
        })
      : prisma.clientRequest.update({
          where: { id: row.id },
          data: { deliveryStatus: "REVISION", reviewedAt: new Date(), reviewedByName: user.fullName },
        }),
  ]);

  await notifyAdminsNewRequest({ clientName: user.clientName, title, revision: true });
  refresh();
}
