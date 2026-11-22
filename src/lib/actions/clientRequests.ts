"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePortalActor, SOCIAL_SERVICE_MESSAGE } from "@/lib/clientPortal";
import { MAX_CLIENT_FILES, storeClientMedias } from "@/lib/fileStore";
import { notifyAdminsNewRequest } from "@/lib/clientNotify";
import { pushNotification } from "@/lib/inAppNotify";
import { notifyTaskReturnedToProgress } from "@/lib/notifications";
import type { Urgency } from "@prisma/client";

const URGENCIES: Urgency[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/** Müşteri panelinden yeni iş talebi: başlık, iş detayı, referans görsel/video, not ve aciliyet. */
export async function createClientRequest(formData: FormData) {
  const user = await requirePortalActor();
  if (!user.socialManaged) throw new Error(SOCIAL_SERVICE_MESSAGE);

  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const urgencyRaw = String(formData.get("urgency") ?? "MEDIUM") as Urgency;
  const urgency = URGENCIES.includes(urgencyRaw) ? urgencyRaw : "MEDIUM";

  if (!title) throw new Error("Talep başlığı gerekli.");
  if (title.length > 120) throw new Error("Başlık en fazla 120 karakter olabilir.");
  if (details.length > 4000 || note.length > 2000) throw new Error("Metin çok uzun.");

  const uploads = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploads.length > MAX_CLIENT_FILES) throw new Error(`En fazla ${MAX_CLIENT_FILES} dosya ekleyebilirsiniz.`);
  const stored =
    uploads.length > 0
      ? await storeClientMedias(uploads, {
          client: { id: user.clientId, name: user.clientName },
          kind: "REQUEST",
          label: `Talep - ${title}`,
          uploadedById: user.id,
        })
      : [];

  await prisma.clientRequest.create({
    data: {
      clientId: user.clientId,
      createdById: user.id,
      title,
      details: details || null,
      note: note || null,
      urgency,
      files: { create: stored.map((f, i) => ({ url: f.url, name: f.name, position: i })) },
    },
  });

  await notifyAdminsNewRequest({ clientName: user.clientName, title });
  revalidatePath("/panel/talepler");
  revalidatePath("/talepler");
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Bu işlem için yetkiniz yok.");
  return session.user;
}

type RevisionRequest = {
  id: string;
  clientId: string;
  createdById: string;
  title: string;
  details: string | null;
  contentItemId: string | null;
  sourceRequestId: string | null;
  client: { name: string };
};

/** Revize edilen teslimin ait olduğu iş: içerik satırının ya da kaynak talebin işi (aynı müşteriye ait olmalı). */
async function findRevisionSourceTask(req: RevisionRequest) {
  let taskId: string | null = null;
  if (req.contentItemId) {
    const item = await prisma.contentItem.findUnique({ where: { id: req.contentItemId }, select: { taskId: true } });
    taskId = item?.taskId ?? null;
  } else if (req.sourceRequestId) {
    const src = await prisma.clientRequest.findUnique({ where: { id: req.sourceRequestId }, select: { taskId: true } });
    taskId = src?.taskId ?? null;
  }
  if (!taskId) return null;
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignedTo: true } });
  if (!task || task.clientId !== req.clientId) return null;
  return task;
}

/** Revize notu ve müşterinin çizimli / yeni dosyaları mevcut işe eklenir, iş yeniden "Devam ediyor"a döner. */
async function applyRevisionToTask(
  req: RevisionRequest,
  task: NonNullable<Awaited<ReturnType<typeof findRevisionSourceTask>>>,
  adminId: string,
  decisionNote?: string
) {
  const files = await prisma.clientRequestFile.findMany({ where: { requestId: req.id }, orderBy: { position: "asc" } });
  const stamp = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
  const block = [`[${stamp}] Müşteri revizesi`, req.details ?? "", decisionNote?.trim() ? `Yönetici notu: ${decisionNote.trim()}` : ""]
    .filter(Boolean)
    .join("\n");
  const revisionNote = task.revisionNote ? `${task.revisionNote}\n\n──────────\n${block}` : block;
  const reopen = task.status === "DONE" || task.status === "PENDING_APPROVAL";

  const existing = await prisma.taskRevisionFile.count({ where: { taskId: task.id } });
  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { revisionNote, ...(reopen ? { status: "IN_PROGRESS", completedAt: null } : {}) },
    }),
    // Önceki revizenin çizimli dosyaları "eski revize" olur.
    prisma.taskRevisionFile.updateMany({ where: { taskId: task.id, archivedAt: null }, data: { archivedAt: new Date() } }),
    ...(files.length > 0
      ? [
          prisma.taskRevisionFile.createMany({
            data: files.map((f, i) => ({ taskId: task.id, url: f.url, name: f.name, position: existing + i })),
          }),
        ]
      : []),
    prisma.clientRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", decidedAt: new Date(), decisionNote: decisionNote?.trim() || null },
    }),
    prisma.activity.create({
      data: {
        userId: adminId,
        taskId: task.id,
        message: `${req.client.name} müşteri revizesini onayladı, "${task.title}" işine eklendi${files.length > 0 ? ` (${files.length} dosya)` : ""}`,
      },
    }),
  ]);

  await pushNotification({
    userId: req.createdById,
    type: "REQUEST_DECISION",
    title: "Revize talebiniz onaylandı",
    message: `"${req.title}" revize talebiniz onaylandı ve ekibimize iletildi.`,
    url: "/panel/talepler",
  });

  // İşe atanan kişiye "revize geldi", atanan yoksa müşteri sorumlularına bildirim.
  if (task.assignedTo && task.assignedTo.id !== adminId) {
    await pushNotification({
      userId: task.assignedTo.id,
      taskId: task.id,
      type: "TASK_RETURNED",
      title: "Müşteri revize istedi",
      message: `"${task.title}" işi için müşteri revizesi geldi.`,
    });
    if (task.assignedTo.emailNotificationsEnabled) {
      await notifyTaskReturnedToProgress({
        to: task.assignedTo.email,
        assigneeName: task.assignedTo.fullName,
        taskTitle: task.title,
      });
    }
  } else if (!task.assignedTo) {
    const leads = await prisma.user.findMany({
      where: { isActive: true, isDeleted: false, role: { not: "CLIENT" }, ledClients: { some: { id: req.clientId } } },
      select: { id: true },
    });
    await Promise.all(
      leads
        .filter((l) => l.id !== adminId)
        .map((l) =>
          pushNotification({
            userId: l.id,
            taskId: task.id,
            type: "TASK_RETURNED",
            title: "Müşteri revize istedi",
            message: `${req.client.name}: "${task.title}" işi için revize geldi.`,
          })
        )
    );
  }

  revalidatePath("/");
  revalidatePath("/talepler");
  revalidatePath("/panel/talepler");
  revalidatePath("/panel/icerik");
  revalidatePath("/musteriler/[id]/icerik", "page");
}

/** Admin onaylar: talep, müşterinin iş listesine "müşteri talebi" olarak atanmamış bir iş olarak düşer
 * (müşteri sorumlusu çalışan görür, admin/sorumlu kişiye paylaştırır). */
export async function approveClientRequest(requestId: string, input?: { urgency?: Urgency; note?: string }) {
  const admin = await requireAdmin();
  const req = await prisma.clientRequest.findUnique({ where: { id: requestId }, include: { client: true } });
  if (!req) throw new Error("Talep bulunamadı.");
  if (req.status !== "PENDING") throw new Error("Bu talep zaten sonuçlandırılmış.");

  // Müşteri revizesi: teslim edilen işin kendi kartına işlenir (yeni kart açılmaz). İş bulunamazsa eski davranış: yeni iş.
  if (req.kind === "REVISION") {
    const sourceTask = await findRevisionSourceTask(req);
    if (sourceTask) {
      await applyRevisionToTask(req, sourceTask, admin.id, input?.note);
      return;
    }
  }

  const urgency = input?.urgency && URGENCIES.includes(input.urgency) ? input.urgency : req.urgency;
  const description = [req.details, req.note ? `Müşteri notu: ${req.note}` : null].filter(Boolean).join("\n\n") || null;

  const task = await prisma.task.create({
    data: {
      title: req.title,
      description,
      clientId: req.clientId,
      // "Veren" müşteri kullanıcısı olur; kartlarda "Müşteri talebi" olarak görünür.
      createdById: req.createdById,
      urgency,
    },
  });

  await prisma.clientRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      decidedAt: new Date(),
      decisionNote: input?.note?.trim() || null,
      taskId: task.id,
    },
  });

  // İçerik tablosundaki bir teslimin revizesiyse, satır bu yeni işe bağlanır ("İçerik listesine gönder" otomatik o satırı seçer).
  if (req.kind === "REVISION" && req.contentItemId) {
    await prisma.contentItem.updateMany({ where: { id: req.contentItemId }, data: { taskId: task.id } });
  }

  await prisma.activity.create({
    data: {
      userId: admin.id,
      taskId: task.id,
      message: `${req.client.name} müşteri talebini onayladı: "${req.title}"`,
    },
  });

  await pushNotification({
    userId: req.createdById,
    taskId: task.id,
    type: "REQUEST_DECISION",
    title: "Talebiniz onaylandı",
    message: `"${req.title}" talebiniz onaylandı ve iş listemize alındı.`,
    url: "/panel/talepler",
  });

  // Müşteri sorumluları işi görsün.
  const leads = await prisma.user.findMany({
    where: { isActive: true, isDeleted: false, role: { not: "CLIENT" }, ledClients: { some: { id: req.clientId } } },
    select: { id: true },
  });
  await Promise.all(
    leads
      .filter((l) => l.id !== admin.id)
      .map((l) =>
        pushNotification({
          userId: l.id,
          taskId: task.id,
          type: "TASK_UNASSIGNED",
          title: "Yeni müşteri talebi işi",
          message: `${req.client.name}: "${req.title}" talebi iş listesine eklendi.`,
        })
      )
  );

  revalidatePath("/");
  revalidatePath("/talepler");
  revalidatePath("/panel/talepler");
}

export async function rejectClientRequest(requestId: string, note: string) {
  await requireAdmin();
  const req = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error("Talep bulunamadı.");
  if (req.status !== "PENDING") throw new Error("Bu talep zaten sonuçlandırılmış.");

  await prisma.clientRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", decidedAt: new Date(), decisionNote: note.trim() || null },
  });
  // Reddedilen bir revize: teslim yeniden müşterinin onayına açılır (onaylayabilir ya da başka bir revize isteyebilir).
  if (req.kind === "REVISION") {
    if (req.contentItemId) {
      await prisma.contentItem.updateMany({
        where: { id: req.contentItemId, deliveryStatus: "REVISION" },
        data: { deliveryStatus: "REVIEW" },
      });
    }
    if (req.sourceRequestId) {
      await prisma.clientRequest.updateMany({
        where: { id: req.sourceRequestId, deliveryStatus: "REVISION" },
        data: { deliveryStatus: "REVIEW" },
      });
    }
  }
  revalidatePath("/panel/icerik");
  revalidatePath("/musteriler/[id]/icerik", "page");
  await pushNotification({
    userId: req.createdById,
    type: "REQUEST_DECISION",
    title: "Talebiniz hakkında",
    message: `"${req.title}" talebiniz onaylanmadı${note.trim() ? `: ${note.trim()}` : "."}`,
    url: "/panel/talepler",
  });
  revalidatePath("/talepler");
  revalidatePath("/panel/talepler");
}
