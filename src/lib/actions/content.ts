"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContentActor, type ContentActor } from "@/lib/contentAccess";
import { MAX_CLIENT_FILES, storeClientMedias } from "@/lib/fileStore";
import { auth } from "@/auth";
import { CONTENT_TYPE_LABEL, isContentType } from "@/lib/contentTypes";
import { canManageClientJobs } from "@/lib/clientAccess";
import { pushNotification } from "@/lib/inAppNotify";

const MAX_TITLE = 160;
const MAX_TEXT = 6000;
const MAX_DOC_BYTES = 300_000;

export type ContentFields = { title: string; details: string; note: string; contentType?: string };

function clean(input: ContentFields) {
  const title = input.title.trim();
  const details = input.details.trim();
  const note = input.note.trim();
  if (!title) throw new Error("Başlık gerekli.");
  if (title.length > MAX_TITLE) throw new Error(`Başlık en fazla ${MAX_TITLE} karakter olabilir.`);
  if (details.length > MAX_TEXT || note.length > MAX_TEXT) throw new Error("Metin çok uzun.");
  const type = (input.contentType ?? "").trim();
  if (type && !isContentType(type)) throw new Error("Geçersiz içerik türü.");
  return { title, details: details || null, note: note || null, contentType: type || null };
}

function refresh() {
  revalidatePath("/panel/icerik");
  revalidatePath("/musteriler/[id]/icerik", "page");
}

const LOCKED_MESSAGE =
  "Bu içerik işleme alındı, artık değişiklik yapılamıyor. Bir değişiklik gerekiyorsa lütfen ekibimizle iletişime geçin.";

/** "İş olarak ekle" ile işleme alınan (iş hâlâ duran) satırı müşteri değiştiremez; ekip değiştirebilir. */
async function assertNotLockedForClient(actor: ContentActor, taskId: string | null) {
  if (!actor.isClient || !taskId) return;
  if ((await prisma.task.count({ where: { id: taskId } })) > 0) throw new Error(LOCKED_MESSAGE);
}

const validMonth = (year: number, month: number) =>
  Number.isInteger(year) && year >= 2020 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;

// ---- Tablo modülü ----

export async function createContentItem(clientId: string, year: number, month: number, input: ContentFields) {
  const actor = await requireContentActor(clientId);
  if (!validMonth(year, month)) throw new Error("Geçersiz ay.");
  const data = clean(input);
  const last = await prisma.contentItem.aggregate({ where: { clientId, year, month }, _max: { position: true } });
  const item = await prisma.contentItem.create({
    data: {
      clientId,
      year,
      month,
      ...data,
      position: (last._max.position ?? -1) + 1,
      createdById: actor.id,
      createdByName: actor.name,
    },
  });
  refresh();
  return item.id;
}

export async function updateContentItem(id: string, input: ContentFields) {
  const item = await prisma.contentItem.findUnique({ where: { id }, select: { clientId: true, taskId: true } });
  if (!item) throw new Error("Satır bulunamadı.");
  const actor = await requireContentActor(item.clientId);
  await assertNotLockedForClient(actor, item.taskId);
  await prisma.contentItem.update({ where: { id }, data: clean(input) });
  refresh();
}

/** İçerik satırını, o müşteri için atanmamış bir iş olarak iş listesine ekler (admin ve müşterinin sorumlusu).
 * Satırın başlığı/detayı/notu işin açıklaması, referans dosyaları işin referansı olur. */
export async function createJobFromContentItem(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Bu işlem için yetkiniz yok.");

  const item = await prisma.contentItem.findUnique({
    where: { id },
    include: { files: { orderBy: { position: "asc" } }, client: { select: { id: true, name: true } } },
  });
  if (!item) throw new Error("Satır bulunamadı.");
  if (!(await canManageClientJobs(session.user, item.clientId))) {
    throw new Error("Bu müşteri için iş ekleme yetkin yok.");
  }
  if (item.taskId && (await prisma.task.count({ where: { id: item.taskId } })) > 0) {
    throw new Error("Bu içerik zaten iş listesine eklenmiş.");
  }

  const typeLabel = item.contentType ? CONTENT_TYPE_LABEL[item.contentType] : null;
  const description =
    [
      typeLabel ? `İçerik türü: ${typeLabel}` : null,
      item.details?.trim() || null,
      item.note?.trim() ? `Not: ${item.note.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n\n") || null;

  const task = await prisma.task.create({
    data: {
      title: item.title.slice(0, 160),
      description,
      clientId: item.clientId,
      createdById: session.user.id,
      urgency: "MEDIUM",
      attachments: {
        create: item.files.map((f, position) => ({ fileUrl: f.url, fileName: f.name, fileSize: 0, position })),
      },
    },
  });
  await prisma.contentItem.update({ where: { id }, data: { taskId: task.id } });
  await prisma.activity.create({
    data: {
      userId: session.user.id,
      taskId: task.id,
      message: `${item.client.name} içerik tablosundan iş ekledi: "${item.title}"`,
    },
  });

  // Müşterinin sorumluları (ekleyen hariç) yeni işi görsün.
  const leads = await prisma.user.findMany({
    where: { isActive: true, isDeleted: false, role: { not: "CLIENT" }, ledClients: { some: { id: item.clientId } } },
    select: { id: true },
  });
  await Promise.all(
    leads
      .filter((l) => l.id !== session.user.id)
      .map((l) =>
        pushNotification({
          userId: l.id,
          taskId: task.id,
          type: "TASK_UNASSIGNED",
          title: "Yeni iş eklendi",
          message: `${item.client.name}: "${item.title}" içerikten iş listesine eklendi.`,
        })
      )
  );

  revalidatePath("/");
  refresh();
  return task.id;
}

export async function addContentItemFiles(id: string, formData: FormData) {
  const item = await prisma.contentItem.findUnique({
    where: { id },
    select: { clientId: true, taskId: true, title: true, client: { select: { name: true } }, _count: { select: { files: true } } },
  });
  if (!item) throw new Error("Satır bulunamadı.");
  const actor = await requireContentActor(item.clientId);
  await assertNotLockedForClient(actor, item.taskId);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Dosya seçilmedi.");
  if (item._count.files + files.length > MAX_CLIENT_FILES) {
    throw new Error(`Bir satıra en fazla ${MAX_CLIENT_FILES} dosya eklenebilir.`);
  }

  const stored = await storeClientMedias(files, {
    client: { id: item.clientId, name: item.client.name },
    kind: "CONTENT",
    label: `İçerik - ${item.title}`,
    uploadedById: actor.id,
  });
  const created = await prisma.$transaction(
    stored.map((f, i) =>
      prisma.contentItemFile.create({
        data: { itemId: id, url: f.url, name: f.name, position: item._count.files + i },
        select: { id: true, url: true, name: true },
      })
    )
  );
  refresh();
  return created;
}

export async function removeContentItemFile(fileId: string) {
  const file = await prisma.contentItemFile.findUnique({
    where: { id: fileId },
    select: { item: { select: { clientId: true, taskId: true } } },
  });
  if (!file) throw new Error("Dosya bulunamadı.");
  const actor = await requireContentActor(file.item.clientId);
  await assertNotLockedForClient(actor, file.item.taskId);
  // Dosya Drive'da kalır (kalıcı arşiv); sadece satırdan ayrılır.
  await prisma.contentItemFile.delete({ where: { id: fileId } });
  refresh();
}

/** Düz yazı editörüne sürüklenen / yapıştırılan görseli Drive'a yükler; metne konacak adresi döner. */
export async function uploadContentImage(clientId: string, formData: FormData) {
  const actor = await requireContentActor(clientId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Dosya seçilmedi.");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) throw new Error("Müşteri bulunamadı.");
  const [stored] = await storeClientMedias([file], {
    client: { id: clientId, name: client.name },
    kind: "CONTENT",
    label: "Metin görseli",
    uploadedById: actor.id,
    imagesOnly: true,
  });
  return { url: stored.url };
}

export async function deleteContentItem(id: string) {
  const item = await prisma.contentItem.findUnique({ where: { id }, select: { clientId: true, taskId: true } });
  if (!item) throw new Error("Satır bulunamadı.");
  const actor = await requireContentActor(item.clientId);
  await assertNotLockedForClient(actor, item.taskId);
  await prisma.contentItem.delete({ where: { id } });
  refresh();
}

// ---- Düz yazı modülü (TipTap JSON) ----

function checkBody(body: string) {
  if (body.length > MAX_DOC_BYTES) throw new Error("Metin çok uzun.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Metin biçimi geçersiz.");
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { type?: string }).type !== "doc") {
    throw new Error("Metin biçimi geçersiz.");
  }
  // Metindeki görseller sadece kendi dosya adresimizden olabilir (harici adres / izleme pikseli olmasın).
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: { src?: unknown }; content?: unknown[] };
    if (n.type === "image" && !(typeof n.attrs?.src === "string" && /^\/api\/files\/[A-Za-z0-9]+$/.test(n.attrs.src))) {
      throw new Error("Metindeki görsel geçersiz.");
    }
    n.content?.forEach(walk);
  };
  walk(parsed);
}

export async function createContentDoc(clientId: string, year: number, month: number, title: string, body: string) {
  const actor = await requireContentActor(clientId);
  if (!validMonth(year, month)) throw new Error("Geçersiz ay.");
  const t = title.trim();
  if (!t) throw new Error("Başlık gerekli.");
  if (t.length > MAX_TITLE) throw new Error(`Başlık en fazla ${MAX_TITLE} karakter olabilir.`);
  checkBody(body);
  const doc = await prisma.contentDoc.create({
    data: { clientId, year, month, title: t, body, createdById: actor.id, createdByName: actor.name },
  });
  refresh();
  return doc.id;
}

export async function updateContentDoc(id: string, title: string, body: string) {
  const doc = await prisma.contentDoc.findUnique({ where: { id }, select: { clientId: true } });
  if (!doc) throw new Error("Metin bulunamadı.");
  await requireContentActor(doc.clientId);
  const t = title.trim();
  if (!t) throw new Error("Başlık gerekli.");
  if (t.length > MAX_TITLE) throw new Error(`Başlık en fazla ${MAX_TITLE} karakter olabilir.`);
  checkBody(body);
  await prisma.contentDoc.update({ where: { id }, data: { title: t, body } });
  refresh();
}

export async function deleteContentDoc(id: string) {
  const doc = await prisma.contentDoc.findUnique({ where: { id }, select: { clientId: true } });
  if (!doc) throw new Error("Metin bulunamadı.");
  await requireContentActor(doc.clientId);
  await prisma.contentDoc.delete({ where: { id } });
  refresh();
}
