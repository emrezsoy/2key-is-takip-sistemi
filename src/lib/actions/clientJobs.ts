"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageClientJobs } from "@/lib/clientAccess";
import { notifyRequesterTaskDone } from "@/lib/clientNotify";
import { calculateDeadline } from "@/lib/deadline";
import { MAX_TASK_ATTACHMENTS, storeTaskAttachments, uploadedFilesOf } from "@/lib/fileStore";
import { pushNotification } from "@/lib/inAppNotify";
import { notifyTaskAssigned } from "@/lib/notifications";
import { splitJobText } from "@/lib/jobText";
import type { Urgency } from "@prisma/client";

const URGENCIES: Urgency[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const MAX_TEXT = 2000;

function parseUrgency(raw: FormDataEntryValue | null): Urgency {
  const value = String(raw ?? "MEDIUM") as Urgency;
  return URGENCIES.includes(value) ? value : "MEDIUM";
}

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  return session.user;
}

/** Müşteri kartından, atanmamış yeni bir iş ekler (düz metin + aciliyet). */
export async function createClientJob(clientId: string, formData: FormData) {
  const user = await requireSession();
  if (!(await canManageClientJobs(user, clientId))) {
    throw new Error("Bu müşteri için iş ekleme yetkin yok.");
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Müşteri bulunamadı.");

  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("İş metni boş olamaz.");
  if (text.length > MAX_TEXT) throw new Error(`İş metni en fazla ${MAX_TEXT} karakter olabilir.`);

  const urgency = parseUrgency(formData.get("urgency"));

  const durationRaw = Math.floor(Number(formData.get("durationValue") ?? 0));
  const durationValue = durationRaw > 0 ? durationRaw : null;
  const durationUnit = durationValue
    ? formData.get("durationUnit") === "HOUR"
      ? "HOUR"
      : "DAY"
    : null;

  const { title, description } = splitJobText(text);

  const stored = await storeTaskAttachments(uploadedFilesOf(formData), {
    client: { id: client.id, name: client.name },
    taskTitle: title,
    uploadedById: user.id,
  });

  const task = await prisma.task.create({
    data: {
      title,
      description,
      clientId,
      createdById: user.id,
      urgency,
      durationValue,
      durationUnit,
      attachments: {
        create: stored.map((f, position) => ({ fileUrl: f.url, fileName: f.name, fileSize: f.size, position })),
      },
    },
  });

  await prisma.activity.create({
    data: {
      userId: user.id,
      taskId: task.id,
      message: `${client.name} için yeni iş ekledi: "${title}"`,
    },
  });

  revalidatePath("/");
}

/** Var olan işe sonradan referans dosyası ekler (admin ve müşteri sorumlusu). Mevcut dosyalar silinmez. */
export async function addTaskAttachments(taskId: string, formData: FormData) {
  const user = await requireSession();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { id: true, name: true } }, _count: { select: { attachments: true } } },
  });
  if (!task) throw new Error("İş bulunamadı.");
  if (!(await canManageClientJobs(user, task.clientId))) throw new Error("Bu işe dosya ekleme yetkin yok.");
  if (task.status === "DONE") throw new Error("Tamamlanan işe dosya eklenemez.");

  const files = uploadedFilesOf(formData);
  if (files.length === 0) throw new Error("Bir dosya seçmelisin.");
  if (task._count.attachments + files.length > MAX_TASK_ATTACHMENTS) {
    throw new Error(`Bir işe en fazla ${MAX_TASK_ATTACHMENTS} referans dosyası eklenebilir.`);
  }

  const stored = await storeTaskAttachments(files, {
    client: task.client ?? { id: null, name: "Müşterisiz" },
    taskTitle: task.title,
    uploadedById: user.id,
  });
  await prisma.taskAttachment.createMany({
    data: stored.map((f, i) => ({
      taskId,
      fileUrl: f.url,
      fileName: f.name,
      fileSize: f.size,
      position: task._count.attachments + i,
    })),
  });
  await prisma.activity.create({
    data: {
      userId: user.id,
      taskId,
      message: `"${task.title}" işine ${stored.length} referans dosyası ekledi`,
    },
  });
  revalidatePath("/");
}

/** İşi bir kişiye atar (sürükle-bırak veya açılır liste). `null` = atamayı kaldır. */
export async function assignTask(taskId: string, assigneeId: string | null) {
  const user = await requireSession();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: true, assignedTo: true },
  });
  if (!task) throw new Error("İş bulunamadı.");
  if (!(await canManageClientJobs(user, task.clientId))) {
    throw new Error("Bu işi paylaştırma yetkin yok.");
  }
  if (task.status !== "TODO" && task.status !== "IN_PROGRESS") {
    throw new Error("Sadece başlamamış veya devam eden işler başka birine atanabilir.");
  }
  if (task.assignedToId === assigneeId) return;

  let assignee = null;
  if (assigneeId) {
    assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || !assignee.isActive || assignee.isDeleted) {
      throw new Error("Seçilen kişi bulunamadı veya aktif değil.");
    }
    if (assignee.role === "ADMIN" && user.role !== "ADMIN") {
      throw new Error("Yöneticilere iş atanamaz.");
    }
  }

  // Süre girilmişse teslim tarihi, işin verildiği andan itibaren hesaplanır.
  const calculatedDeadline =
    assignee && task.durationValue && task.durationUnit
      ? await calculateDeadline(assignee.id, task.durationValue, task.durationUnit)
      : null;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      assignedToId: assigneeId,
      status: "TODO",
      calculatedDeadline,
      completedAt: null,
    },
  });

  await prisma.activity.create({
    data: {
      userId: user.id,
      taskId,
      message: assignee
        ? `"${task.title}" işini ${assignee.fullName} kişisine atadı`
        : `"${task.title}" işinin atamasını kaldırdı`,
    },
  });

  if (assignee && assignee.id !== user.id) {
    await pushNotification({
      userId: assignee.id,
      taskId: task.id,
      type: "TASK_ASSIGNED",
      title: "Yeni iş atandı",
      message: `"${task.title}" işi sana atandı.`,
    });
    if (assignee.emailNotificationsEnabled) {
      await notifyTaskAssigned({
        to: assignee.email,
        assigneeName: assignee.fullName,
        taskTitle: task.title,
        clientName: task.client?.name,
        deadline: calculatedDeadline,
      });
    }
  }

  const previous = task.assignedTo;
  if (previous && previous.id !== user.id && previous.id !== assigneeId) {
    await pushNotification({
      userId: previous.id,
      taskId: task.id,
      type: "TASK_UNASSIGNED",
      title: "İş senden alındı",
      message: `"${task.title}" işi başka birine devredildi.`,
    });
  }

  revalidatePath("/");
}

/** İş metnini ve aciliyetini günceller. */
export async function updateJob(taskId: string, formData: FormData) {
  const user = await requireSession();

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("İş bulunamadı.");
  if (!(await canManageClientJobs(user, task.clientId))) {
    throw new Error("Bu işi düzenleme yetkin yok.");
  }
  if (task.status === "DONE") throw new Error("Tamamlanan iş düzenlenemez.");

  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("İş metni boş olamaz.");
  if (text.length > MAX_TEXT) throw new Error(`İş metni en fazla ${MAX_TEXT} karakter olabilir.`);

  const { title, description } = splitJobText(text);

  await prisma.task.update({
    where: { id: taskId },
    data: { title, description, urgency: parseUrgency(formData.get("urgency")) },
  });

  revalidatePath("/");
}

/** Yanlışlıkla eklenen işi siler. Güvenlik için sadece henüz başlanmamış ve
 * teslim dosyası olmayan işler silinebilir; geçmiş veriler korunur. */
export async function deleteJob(taskId: string) {
  const user = await requireSession();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { _count: { select: { submissions: true } } },
  });
  if (!task) throw new Error("İş bulunamadı.");
  if (!(await canManageClientJobs(user, task.clientId))) {
    throw new Error("Bu işi silme yetkin yok.");
  }
  if (task.status !== "TODO" || task._count.submissions > 0) {
    throw new Error("Sadece henüz başlanmamış işler silinebilir.");
  }

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { taskId } }),
    prisma.activity.deleteMany({ where: { taskId } }),
    prisma.task.delete({ where: { id: taskId } }),
  ]);

  if (task.assignedToId && task.assignedToId !== user.id) {
    await pushNotification({
      userId: task.assignedToId,
      type: "TASK_UNASSIGNED",
      title: "İş iptal edildi",
      message: `"${task.title}" işi iptal edildi.`,
    });
  }

  revalidatePath("/");
}

/** Admin, atanmamış (ya da devam eden) bir işi kendisi hallettiyse doğrudan "Tamamlandı"ya alır;
 * kimseye atamaya gerek yoktur. */
export async function completeJob(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("İş bulunamadı.");
  // Admin her işi, müşteri sorumlusu sadece sorumlu olduğu müşterinin işini tamamlayabilir.
  if (!(await canManageClientJobs(session.user, task.clientId))) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  if (task.status === "DONE") return;

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "DONE", completedAt: new Date() },
  });
  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId,
      message: `"${task.title}" işini tamamlandı olarak işaretledi`,
    },
  });
  await notifyRequesterTaskDone(taskId);
  revalidatePath("/");
}
