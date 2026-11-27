"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateDeadline } from "@/lib/deadline";
import { storeSubmissionFiles, storeTaskAttachments, uploadedFilesOf } from "@/lib/fileStore";
import { canCreateTask, canSetDifficulty, canSetUrgency } from "@/lib/permissions";
import {
  notifyTaskAssigned,
  notifyTaskPendingApproval,
  notifyTaskReturnedToProgress,
} from "@/lib/notifications";
import { pushNotification } from "@/lib/inAppNotify";
import { canManageClientJobs } from "@/lib/clientAccess";
import { deleteUploadedFile } from "@/lib/storage";
import { appendAdminRevision } from "@/lib/revisionNote";
import { parseRevisionForm, revisionDetails } from "@/lib/revisionForm";
import { notifyRequesterTaskDone } from "@/lib/clientNotify";
import { DurationUnit, TaskStatus, Urgency } from "@prisma/client";
import type { Role } from "@prisma/client";

/** Onay/revize yetkisi: admin ve süpervizör her işi, müşteri sorumlusu ise
 * sorumlu olduğu müşterinin (kendisine ait olmayan) işlerini inceleyebilir. */
async function canReviewTask(
  user: { id: string; role: Role },
  task: { clientId: string | null; assignedToId: string | null }
) {
  if (user.role === "ADMIN" || user.role === "SUPERVISOR") return true;
  // Müşteri sorumlusu, sorumlu olduğu müşterinin tüm işlerini (kendi hazırladıkları dahil) onaylayabilir.
  return canManageClientJobs(user, task.clientId);
}

/** İşi yapma yetkisi: atanan kişi; ayrıca müşteri sorumlusu çalışan, sorumlu olduğu müşterinin
 * henüz kimseye atanmamış işini ilk işlediğinde (başlat/dosya yükle) iş otomatik ona atanır. */
async function claimIfLeadOfUnassigned(
  user: { id: string; role: Role },
  task: { id: string; clientId: string | null; assignedToId: string | null }
) {
  if (task.assignedToId === user.id) return true;
  if (task.assignedToId !== null || user.role === "ADMIN" || user.role === "SUPERVISOR") return false;
  if (!(await canManageClientJobs(user, task.clientId))) return false;
  await prisma.task.update({ where: { id: task.id }, data: { assignedToId: user.id } });
  return true;
}

export async function createTask(formData: FormData) {
  const session = await auth();
  if (!session?.user || !canCreateTask(session.user)) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "") || null;
  const assignedToId = String(formData.get("assignedToId") ?? "");
  const durationValue = Number(formData.get("durationValue") ?? 0);
  const durationUnit = String(formData.get("durationUnit") ?? "DAY") as DurationUnit;
  const urgency = String(formData.get("urgency") ?? "MEDIUM") as Urgency;
  const difficultyRaw = formData.get("difficulty");
  const files = uploadedFilesOf(formData);

  if (!title || !assignedToId || !durationValue) {
    throw new Error("Zorunlu alanlar eksik.");
  }
  if (!canSetUrgency(session.user) && formData.get("urgency")) {
    // sadece admin/süpervizör aciliyet belirleyebilir, diğerleri varsayılan kalır
  }

  const difficulty =
    canSetDifficulty(session.user) && difficultyRaw ? Number(difficultyRaw) : null;

  let stored: { url: string; name: string; size: number }[] = [];
  if (files.length > 0) {
    const fileClient = clientId
      ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } })
      : null;
    stored = await storeTaskAttachments(files, {
      client: fileClient ?? { id: null, name: "Müşterisiz" },
      taskTitle: title,
      uploadedById: session.user.id,
    });
  }

  const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
  if (!assignee) throw new Error("Atanan kişi bulunamadı.");

  const calculatedDeadline = await calculateDeadline(
    assignedToId,
    durationValue,
    durationUnit
  );

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      clientId,
      assignedToId,
      createdById: session.user.id,
      durationValue,
      durationUnit,
      urgency,
      difficulty,
      calculatedDeadline,
      attachments: {
        create: stored.map((f, position) => ({ fileUrl: f.url, fileName: f.name, fileSize: f.size, position })),
      },
    },
    include: { client: true },
  });

  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId: task.id,
      message: `"${title}" görevini ekledi`,
    },
  });

  if (assignee.id !== session.user.id) {
    await pushNotification({
      userId: assignee.id,
      taskId: task.id,
      type: "TASK_ASSIGNED",
      title: "Yeni görev atandı",
      message: `"${task.title}" görevi sana atandı.`,
    });
    if (assignee.emailNotificationsEnabled) {
      await notifyTaskAssigned({
        to: assignee.email,
        assigneeName: assignee.fullName,
        taskTitle: task.title,
        clientName: task.client?.name,
        deadline: task.calculatedDeadline,
      });
    }
  }

  revalidatePath("/");
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  let task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignedTo: true, createdBy: true },
  });
  if (!task) throw new Error("Görev bulunamadı.");

  const isManager = session.user.role === "ADMIN" || session.user.role === "SUPERVISOR";
  if (!isManager) {
    if (!(await claimIfLeadOfUnassigned(session.user, task))) {
      throw new Error("Bu işlem için yetkiniz yok.");
    }
    // Çalışan işi "Tamamlandı" yapamaz; tamamlama onaylayan kişiye aittir.
    if (status === "DONE") throw new Error("İşi sadece onaylayan kişi tamamlandı yapabilir.");
    task = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { assignedTo: true, createdBy: true },
    });
  }

  const previousStatus = task.status;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });

  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId,
      message: `"${task.title}" görevinin durumunu güncelledi`,
    },
  });

  if (status === "DONE" && previousStatus !== "DONE") await notifyRequesterTaskDone(taskId);

  if (status === "PENDING_APPROVAL" && previousStatus !== "PENDING_APPROVAL") {
    // Onay isteği: işi oluşturana ve o müşterinin sorumlularına gider.
    const leads = task.clientId
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            isDeleted: false,
            ledClients: { some: { id: task.clientId } },
          },
        })
      : [];
    // Müşteri talebinden doğan işte "oluşturan" müşteri kullanıcısıdır; ona onay bildirimi gitmez.
    const recipients = new Map(
      [task.createdBy, ...leads]
        .filter((u) => u.role !== "CLIENT")
        .map((u) => [u.id, u] as const)
    );
    const assigneeName = task.assignedTo?.fullName ?? "Bir çalışan";

    for (const recipient of recipients.values()) {
      if (recipient.id === session.user.id || recipient.id === task.assignedToId) continue;
      await pushNotification({
        userId: recipient.id,
        taskId: task.id,
        type: "TASK_PENDING_APPROVAL",
        title: "Onay bekliyor",
        message: `${assigneeName}, "${task.title}" görevini onayına sundu.`,
      });
      if (recipient.emailNotificationsEnabled) {
        await notifyTaskPendingApproval({
          to: recipient.email,
          recipientName: recipient.fullName,
          taskTitle: task.title,
          assigneeName,
        });
      }
    }
  }

  if (
    previousStatus === "PENDING_APPROVAL" &&
    status === "IN_PROGRESS" &&
    task.assignedTo &&
    task.assignedTo.id !== session.user.id
  ) {
    await pushNotification({
      userId: task.assignedTo.id,
      taskId: task.id,
      type: "TASK_RETURNED",
      title: "Revize gerekiyor",
      message: `"${task.title}" görevi revize için sana geri döndü.`,
    });
    if (task.assignedTo.emailNotificationsEnabled) {
      await notifyTaskReturnedToProgress({
        to: task.assignedTo.email,
        assigneeName: task.assignedTo.fullName,
        taskTitle: task.title,
      });
    }
  }

  revalidatePath("/");
}

export async function approveTask(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Görev bulunamadı.");
  if (!(await canReviewTask(session.user, task))) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  if (task.status !== "PENDING_APPROVAL") {
    throw new Error("Sadece onay bekleyen görevler onaylanabilir.");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "DONE", completedAt: new Date() },
  });

  // İş içerik listesinden geldiyse teslim görselleri (ve caption) otomatik o satıra konur.
  // Müşteriye henüz açılmaz (DRAFT); ekip içerik listesinde "Müşteriye gönder" deyince onaya düşer.
  const delivered = await deliverToContentRow(taskId, task.caption, session.user.name ?? session.user.username ?? "Yönetici");

  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId,
      message: `"${task.title}" görevini onayladı${delivered ? ` — teslim "${delivered}" içerik satırına kondu (müşteriye henüz gönderilmedi)` : ""}`,
    },
  });
  await notifyRequesterTaskDone(taskId);

  revalidatePath("/");
  if (delivered) revalidatePath("/musteriler/[id]/icerik", "page");
}

/** İşin bağlı olduğu içerik satırına teslim görsel/videolarını DRAFT olarak koyar. Satır ya da görsel yoksa null. */
async function deliverToContentRow(taskId: string, caption: string | null, byName: string) {
  const item = await prisma.contentItem.findFirst({ where: { taskId }, select: { id: true, title: true } });
  if (!item) return null;
  const subs = await prisma.taskSubmission.findMany({
    where: { taskId },
    orderBy: [{ position: "asc" }, { uploadedAt: "asc" }],
    select: { fileUrl: true, fileName: true },
  });
  const media = subs.filter((x): x is { fileUrl: string; fileName: string } => !!x.fileUrl && x.fileUrl.startsWith("/api/files/") && MEDIA_NAME.test(x.fileName));
  if (media.length === 0) return null;
  await prisma.$transaction([
    prisma.deliveryFile.deleteMany({ where: { contentItemId: item.id } }),
    prisma.deliveryFile.createMany({
      data: media.map((m, position) => ({ contentItemId: item.id, url: m.fileUrl, name: m.fileName, mediaType: VIDEO_NAME.test(m.fileName) ? "VIDEO" : "IMAGE", position })),
    }),
    prisma.contentItem.update({
      where: { id: item.id },
      data: {
        deliveryStatus: "DRAFT",
        deliveredAt: new Date(),
        deliveredByName: byName,
        reviewedAt: null,
        reviewedByName: null,
        ...(caption?.trim() ? { caption: caption.trim() } : {}),
      },
    }),
  ]);
  return item.title;
}

/** Yönetici revizesi: onay bekleyen, devam eden (teslim yüklenmiş) ya da tamamlanmış işe revize verir. İş "Devam ediyor"a döner, çalışana
 * bildirim gider. Müşteriye gönderilmiş ama müşterinin henüz onaylamadığı / revize istemediği teslim geri çekilir. Müşteri revizelerinden ayrı kaydedilir. */
export async function reviseTask(taskId: string, note: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  if (!note.trim()) {
    throw new Error("Revize notu zorunludur.");
  }
  return applyAdminRevision(session.user, taskId, { note: note.trim(), plain: note.trim(), files: [] });
}

const MEDIA_NAME = /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)$/i;
const VIDEO_NAME = /\.(mp4|mov|webm|m4v)$/i;

/** İş kartından çizimli revize (müşteri revizesiyle aynı ekran): teslim görselleri üzerine çizim, etiket notları ve genel not.
 * Çizimli görseller işin "revize dosyaları" olarak kartta görünür; iş "Devam ediyor"a döner. */
export async function reviseTaskAnnotated(taskId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, clientId: true, client: { select: { name: true } },
      submissions: { orderBy: [{ position: "asc" }, { uploadedAt: "asc" }], select: { fileName: true, fileUrl: true } },
    },
  });
  if (!task) throw new Error("Görev bulunamadı.");
  // Editördeki görsel sırası = teslimdeki görsel/video dosyalarının sırası (ekranla aynı süzgeç).
  const media = task.submissions.filter((x) => x.fileUrl && x.fileUrl.startsWith("/api/files/") && MEDIA_NAME.test(x.fileName));
  const { note, annotations, renamed } = parseRevisionForm(formData, media.map((m) => ({ mediaType: VIDEO_NAME.test(m.fileName) ? "VIDEO" : "IMAGE" })));
  const stored =
    renamed.length > 0
      ? await storeTaskAttachments(renamed, { client: { id: task.clientId, name: task.client?.name ?? "" }, taskTitle: task.title, uploadedById: session.user.id })
      : [];
  const body = revisionDetails("İş kartından revize", note, annotations, stored.length > 0);
  const plain = [note, ...annotations.flatMap((a) => a.texts)].filter(Boolean).join(" · ").slice(0, 1000) || "Görsel üzerinde çizimli revize";
  return applyAdminRevision(session.user, taskId, { note: body, plain, files: stored.map((f) => ({ url: f.url, name: f.name })) });
}

async function applyAdminRevision(
  user: { id: string; role: Role; name?: string | null; username?: string | null },
  taskId: string,
  rev: { note: string; plain: string; files: { url: string; name: string }[] }
) {
  const note = rev.note;
  const session = { user };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignedTo: true, _count: { select: { submissions: true } } },
  });
  if (!task) throw new Error("Görev bulunamadı.");
  if (!(await canReviewTask(session.user, task))) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  const revisable =
    task.status === "PENDING_APPROVAL" || task.status === "DONE" || (task.status === "IN_PROGRESS" && task._count.submissions > 0);
  if (!revisable) {
    throw new Error("Revize verilebilmesi için işin teslim dosyası yüklenmiş ya da tamamlanmış olması gerekir.");
  }

  const byName = session.user.name ?? session.user.username ?? "Yönetici";
  const wasDone = task.status === "DONE";

  // Müşteri onayını bekleyen teslimler geri çekilir (müşteri hatalı işi onaylamasın); onaylanmış / revize istenmiş olanlara dokunulmaz.
  const [items, requests] = await Promise.all([
    prisma.contentItem.findMany({ where: { taskId, deliveryStatus: { in: ["REVIEW", "DRAFT"] } }, select: { id: true } }),
    prisma.clientRequest.findMany({ where: { taskId, deliveryStatus: "REVIEW" }, select: { id: true } }),
  ]);
  const reset = { deliveryStatus: null, deliveredAt: null, deliveredByName: null, reviewedAt: null, reviewedByName: null };
  const withdrawn = items.length + requests.length;

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", completedAt: null, revisionNote: appendAdminRevision(task.revisionNote, byName, note) },
    }),
    prisma.taskRevision.create({ data: { taskId, source: "ADMIN", note: rev.plain, byId: session.user.id, byName } }),
    // Önceki revizenin çizimli dosyaları "eski revize" olur.
    prisma.taskRevisionFile.updateMany({ where: { taskId, archivedAt: null }, data: { archivedAt: new Date() } }),
    ...(rev.files.length > 0
      ? [prisma.taskRevisionFile.createMany({ data: rev.files.map((f, i) => ({ taskId, url: f.url, name: f.name, position: i })) })]
      : []),
    ...(items.length > 0
      ? [
          prisma.deliveryFile.deleteMany({ where: { contentItemId: { in: items.map((i) => i.id) } } }),
          prisma.contentItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: reset }),
        ]
      : []),
    ...(requests.length > 0
      ? [
          prisma.deliveryFile.deleteMany({ where: { requestId: { in: requests.map((r) => r.id) } } }),
          prisma.clientRequest.updateMany({ where: { id: { in: requests.map((r) => r.id) } }, data: reset }),
        ]
      : []),
    prisma.activity.create({
      data: {
        userId: session.user.id,
        taskId,
        message: `"${task.title}" görevine yönetici revizesi verdi${wasDone ? " (tamamlanmış iş yeniden açıldı)" : ""}${withdrawn > 0 ? " — müşteriye gönderilen teslim geri çekildi" : ""}${rev.files.length > 0 ? ` (${rev.files.length} çizimli görsel)` : ""}: ${rev.plain}`,
      },
    }),
  ]);

  if (task.assignedTo && task.assignedTo.id !== session.user.id) {
    await pushNotification({
      userId: task.assignedTo.id,
      taskId: task.id,
      type: "TASK_RETURNED",
      title: "Revize gerekiyor",
      message: `"${task.title}" görevi için ${byName} revize verdi: ${rev.plain}`,
    });
    if (task.assignedTo.emailNotificationsEnabled) {
      await notifyTaskReturnedToProgress({
        to: task.assignedTo.email,
        assigneeName: task.assignedTo.fullName,
        taskTitle: task.title,
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/talepler");
  revalidatePath("/panel/icerik");
  revalidatePath("/panel/talepler");
  revalidatePath("/musteriler/[id]/icerik", "page");
  return { withdrawn };
}

export async function submitTaskFile(taskId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!task) throw new Error("Görev bulunamadı.");
  // Atanan kişi, atanmamış işi ilk işleyen müşteri sorumlusu ya da işi yönetebilen (admin / müşteri sorumlusu) kişi yükleyebilir.
  const allowed =
    (await claimIfLeadOfUnassigned(session.user, task)) ||
    (task.status !== "DONE" && (await canManageClientJobs(session.user, task.clientId)));
  if (!allowed) {
    throw new Error("Sadece göreve atanan kişi dosya yükleyebilir.");
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("Bir dosya seçmelisin.");
  }

  // Dosyalar aynı anda yüklenir (çok sayıda büyük dosyada zaman aşımı riskini azaltır);
  // Drive bağlıysa müşterinin "Ay Yıl" klasörüne, değilse sunucuya gider.
  const stored = await storeSubmissionFiles(files, {
    client: task.client ?? { id: null, name: "Müşterisiz" },
    taskTitle: task.title,
    uploadedById: session.user.id,
    uploaderName: session.user.name ?? session.user.username,
  });
  // Yeni dosyalar mevcut sıranın sonuna eklenir.
  const last = await prisma.taskSubmission.aggregate({ where: { taskId }, _max: { position: true } });
  const startAt = (last._max.position ?? -1) + 1;
  await prisma.taskSubmission.createMany({
    data: stored.map((f, i) => ({ taskId, fileUrl: f.url, fileName: f.name, fileSize: f.size, position: startAt + i })),
  });
  const uploaded = stored.map((f) => f.name);

  // İlk dosya yüklendiğinde yapılacak iş otomatik "devam ediyor" olur.
  if (task.status === "TODO") {
    await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  }

  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId,
      message:
        uploaded.length === 1
          ? `"${task.title}" için dosya yükledi: ${uploaded[0]}`
          : `"${task.title}" için ${uploaded.length} dosya yükledi: ${uploaded.join(", ")}`,
    },
  });

  revalidatePath("/");
}

/** Teslim dosyalarını (kaydırmalı postun sayfaları) elle sıralar. `orderedIds` yeni sıradır; listede olmayanlar sona kalır. */
export async function reorderSubmissions(taskId: string, orderedIds: string[]) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Oturum bulunamadı.");

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, clientId: true, assignedToId: true, status: true },
  });
  if (!task) throw new Error("Görev bulunamadı.");
  const allowed =
    (await canManageClientJobs(session.user, task.clientId)) ||
    (task.assignedToId === session.user.id && task.status !== "DONE");
  if (!allowed) throw new Error("Dosyaları sıralama yetkiniz yok.");
  if (!Array.isArray(orderedIds) || orderedIds.length > 200) throw new Error("Geçersiz sıra.");

  const rows = await prisma.taskSubmission.findMany({
    where: { taskId },
    orderBy: [{ position: "asc" }, { uploadedAt: "asc" }],
    select: { id: true },
  });
  const known = new Set(rows.map((r) => r.id));
  const first = [...new Set(orderedIds.filter((id) => typeof id === "string" && known.has(id)))];
  const rest = rows.map((r) => r.id).filter((id) => !first.includes(id));
  const finalOrder = [...first, ...rest];

  await prisma.$transaction(
    finalOrder.map((id, position) => prisma.taskSubmission.update({ where: { id }, data: { position } }))
  );
  revalidatePath("/");
}

const baseName = (name: string) => name.replace(/\.[a-z0-9]{1,8}$/i, "").trim().toLowerCase();

/** Revize edilen dosyaları, işaretlenen eski dosyaların YERİNE koyar (sırası korunur).
 * `targets`: işaretli dosyaların id'leri (kartta göründükleri sırayla). Yeni dosyalar önce adı aynı olan eski dosyayla,
 * kalanlar ad sırasına göre kalan işaretlilerle eşleşir. İşaretli sayısından fazla yeni dosya varsa, son değişen dosyanın
 * hemen arkasına eklenir. Eski dosyalar karttan kalkar (Drive'daki arşiv kopyası ve daha önce takvime/teslime gönderilmiş
 * kopyalar yerinde kalır). */
export async function replaceSubmissionFiles(taskId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!task) throw new Error("Görev bulunamadı.");
  const allowed =
    (await claimIfLeadOfUnassigned(session.user, task)) ||
    (task.status !== "DONE" && (await canManageClientJobs(session.user, task.clientId)));
  if (!allowed) throw new Error("Sadece göreve atanan kişi dosya yükleyebilir.");

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Bir dosya seçmelisin.");

  let targetIds: string[] = [];
  try {
    const raw = JSON.parse(String(formData.get("targets") ?? "[]"));
    if (Array.isArray(raw)) targetIds = raw.map(String);
  } catch {
    targetIds = [];
  }

  const current = await prisma.taskSubmission.findMany({
    where: { taskId },
    orderBy: [{ position: "asc" }, { uploadedAt: "asc" }],
  });
  const byId = new Map(current.map((s) => [s.id, s]));
  const targets = targetIds.filter((id, i) => byId.has(id) && targetIds.indexOf(id) === i);
  if (targets.length === 0) throw new Error("Değiştirilecek dosya seçilmedi.");

  // Eşleştirme: önce adı (uzantısız) aynı olanlar, sonra kalanlar doğal ad sırasıyla.
  const pairOf = new Map<number, string>(); // dosya sırası -> eski submission id
  const freeTargets = [...targets];
  files.forEach((f, i) => {
    const hit = freeTargets.findIndex((id) => baseName(byId.get(id)!.fileName) === baseName(f.name));
    if (hit >= 0) pairOf.set(i, freeTargets.splice(hit, 1)[0]);
  });
  const unmatched = files
    .map((f, i) => ({ f, i }))
    .filter(({ i }) => !pairOf.has(i))
    .sort((a, b) => a.f.name.localeCompare(b.f.name, "tr", { numeric: true }));
  const extras: number[] = [];
  for (const { i } of unmatched) {
    if (freeTargets.length > 0) pairOf.set(i, freeTargets.shift()!);
    else extras.push(i);
  }

  const stored = await storeSubmissionFiles(files, {
    client: task.client ?? { id: null, name: "Müşterisiz" },
    taskTitle: task.title,
    uploadedById: session.user.id,
    uploaderName: session.user.name ?? session.user.username,
  });

  const replacedIds = new Set(pairOf.values());
  const removed = current.filter((s) => replacedIds.has(s.id));
  // Yeni sıra: değişen dosyanın yerine yenisi; fazla gelenler son değişenin arkasına.
  const created = new Map<number, string>(); // dosya sırası -> yeni submission id

  await prisma.$transaction(async (tx) => {
    for (const [i, f] of stored.entries()) {
      const row = await tx.taskSubmission.create({
        data: { taskId, fileUrl: f.url, fileName: f.name, fileSize: f.size },
      });
      created.set(i, row.id);
    }
    const replacingNew = new Map<string, string>(); // eski id -> yeni id
    for (const [i, oldId] of pairOf) replacingNew.set(oldId, created.get(i)!);
    const extraNew = extras.sort((a, b) => files[a].name.localeCompare(files[b].name, "tr", { numeric: true })).map((i) => created.get(i)!);

    const lastReplacedPos = Math.max(-1, ...current.map((s, idx) => (replacedIds.has(s.id) ? idx : -1)));
    const finalOrder: string[] = [];
    current.forEach((s, idx) => {
      finalOrder.push(replacingNew.get(s.id) ?? s.id);
      if (idx === lastReplacedPos) finalOrder.push(...extraNew);
    });
    await tx.taskSubmission.deleteMany({ where: { taskId, id: { in: removed.map((r) => r.id) } } });
    const keep = finalOrder.filter((id) => !removed.some((r) => r.id === id));
    for (const [position, id] of keep.entries()) {
      await tx.taskSubmission.update({ where: { id }, data: { position } });
    }
  });
  await Promise.all(removed.map((r) => (r.fileUrl ? deleteUploadedFile(r.fileUrl) : null)));

  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId,
      message: `"${task.title}" işinde ${removed.length} dosyayı revize edilmiş hâliyle değiştirdi${extras.length > 0 ? ` (+${extras.length} yeni dosya eklendi)` : ""}`,
    },
  });
  revalidatePath("/");
  return { replaced: removed.length, added: extras.length };
}


/** İşin caption'ı (paylaşım metni): işi yapan çalışan, süpervizör / müşteri sorumlusu ve admin yazabilir. Boş bırakılabilir. */
export async function setTaskCaption(taskId: string, caption: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { clientId: true, assignedToId: true } });
  if (!task) throw new Error("Görev bulunamadı.");
  const allowed = task.assignedToId === session.user.id || (await canReviewTask(session.user, task));
  if (!allowed) throw new Error("Bu işlem için yetkiniz yok.");
  const text = caption.trim();
  if (text.length > 2200) throw new Error("Caption en fazla 2200 karakter olabilir (Instagram sınırı).");
  await prisma.task.update({ where: { id: taskId }, data: { caption: text || null } });
  // İş bir içerik satırına bağlıysa satırdaki caption da güncellenir (müşteri onayında görünen metin).
  if (text) await prisma.contentItem.updateMany({ where: { taskId }, data: { caption: text } });
  revalidatePath("/");
  revalidatePath("/musteriler/[id]/icerik", "page");
}
