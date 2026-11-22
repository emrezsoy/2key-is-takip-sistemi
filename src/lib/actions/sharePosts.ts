"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditShareCalendar, canViewShareCalendar, getShareAccess, SHARE_DATE_RE } from "@/lib/shareCalendar";
import { deleteUploadedFile, saveShareImage, validateShareMedia } from "@/lib/storage";
import { driveIfConfigured, saveFilesToDrive, uploadMonth } from "@/lib/driveStorage";
import { assertTaskDelivered, resolveMediaFiles } from "@/lib/mediaFiles";
import { requireClientSender, requireSender } from "@/lib/sendAccess";
import { assertClientInScope, getClientScope, inClientScope } from "@/lib/clientAccess";
import type { SessionUser } from "@/lib/permissions";
import { HEX_COLOR_RE } from "@/components/share/palette";
import { parseShareKind, parseShareTime } from "@/lib/shareTime";
import type { ShareKind, StoredFile } from "@prisma/client";

/** Bir paylaşımdaki (kaydırmalı post) en fazla görsel sayısı. */
const MAX_IMAGES = 20;

async function requireEditor() {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  if (!canEditShareCalendar(await getShareAccess(session.user))) {
    throw new Error("Paylaşım takvimini düzenleme yetkiniz yok.");
  }
  return session.user;
}

/** Görselleri saklar: Google Drive bağlıysa "<Müşteri>/<Ay Yıl>" klasörüne, değilse sunucu diskine. */
async function storeShareImages(
  files: File[],
  ctx: {
    client: { id: string; name: string };
    date: string;
    title: string | null;
    userId: string;
    /** Drive dosya adındaki sıra numarası başlangıcı (düzenlemede mevcut görsel sayısı kadar kayar). */
    offset?: number;
  }
): Promise<{ url: string; name: string | null; mediaType: "IMAGE" | "VIDEO" }[]> {
  const types = files.map(validateShareMedia);
  if (files.length === 0) return [];

  const config = await driveIfConfigured();
  if (!config) {
    // Videolar büyük olduğu için sunucu diskine değil, sadece Drive'a yüklenir.
    if (types.includes("VIDEO")) throw new Error("Video yüklemek için Google Drive bağlı olmalı (Ayarlar).");
    const saved = await Promise.all(files.map((f) => saveShareImage(f)));
    return saved.map((s) => ({ ...s, mediaType: "IMAGE" as const }));
  }

  const saved = await saveFilesToDrive(
    config,
    files,
    { client: ctx.client, kind: "SHARE", uploadedById: ctx.userId },
    (_file, i) => `${ctx.date} ${ctx.client.name} - ${ctx.title ?? "Paylaşım"} - ${(ctx.offset ?? 0) + i + 1}`
  );
  return saved.map((s, i) => ({ url: s.url, name: s.name, mediaType: types[i] }));
}

/** Reels kapak görselini saklar (Drive bağlıysa müşterinin ay klasörüne). */
async function storeCover(file: File, ctx: { client: { id: string; name: string }; date: string; title: string | null; userId: string }) {
  if (validateShareMedia(file) !== "IMAGE") throw new Error("Reels kapağı bir görsel olmalı.");
  const config = await driveIfConfigured();
  if (!config) return saveShareImage(file);
  const [saved] = await saveFilesToDrive(
    config,
    [file],
    { client: ctx.client, kind: "SHARE", uploadedById: ctx.userId },
    () => `${ctx.date} ${ctx.client.name} - ${ctx.title ?? "Paylaşım"} - Kapak`
  );
  return { url: saved.url, name: saved.name };
}

/** Meta'da planlı (ya da o an paylaşılan) paylaşım değiştirilemez; önce planlamadan kaldırılmalı. */
function assertNotMetaLocked(post: { metaStatus: string | null }) {
  if (post.metaStatus === "PUBLISHING") throw new Error("Bu paylaşım şu an Meta'da paylaşılıyor; bitince tekrar deneyin.");
  if (post.metaStatus === "SCHEDULED") {
    throw new Error("Bu paylaşım Meta'da planlı. Değiştirmek için önce \"Planlamadan kaldır\"a basın.");
  }
}

async function parseForm(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const time = parseShareTime(formData.get("time"));
  const kind = parseShareKind(formData.get("kind"));
  const text = String(formData.get("text") ?? "").replace(/\r\n?/g, "\n").trim();
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const coverRaw = formData.get("cover");
  const cover = coverRaw instanceof File && coverRaw.size > 0 ? coverRaw : null;
  const removeCover = formData.get("removeCover") === "1";

  // Görsellerin son sırası: "e:<mevcut görsel id>" veya "n:<yeni dosya sırası>".
  let order: string[] | null = null;
  try {
    const raw = JSON.parse(String(formData.get("order") ?? "null"));
    if (Array.isArray(raw)) order = raw.map(String);
  } catch {
    order = null;
  }

  if (!SHARE_DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error("Geçerli bir tarih seçin.");
  }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  });
  if (!client) throw new Error("Müşteri seçin.");

  return { date, client, title: title || null, text: text || null, time, kind, files, order, cover, removeCover };
}

export async function createSharePost(formData: FormData) {
  const user = await requireEditor();
  const { date, client, title, text, time, kind, files, order, cover } = await parseForm(formData);
  await assertClientInScope(user, client.id);

  // Sıra verilmişse ona göre, yoksa seçilme sırasına göre diz.
  const sequence = (order ?? files.map((_, i) => `n:${i}`))
    .filter((t) => t.startsWith("n:"))
    .map((t) => files[Number(t.slice(2))])
    .filter((f): f is File => !!f);

  if (sequence.length > MAX_IMAGES) throw new Error(`En fazla ${MAX_IMAGES} görsel ekleyebilirsin.`);
  if (sequence.length === 0 && !text && !title) {
    throw new Error("En az bir başlık, görsel veya paylaşım metni ekleyin.");
  }

  const saved = await storeShareImages(sequence, { client, date, title, userId: user.id });
  const savedCover = kind === "REEL" && cover ? await storeCover(cover, { client, date, title, userId: user.id }) : null;
  await prisma.sharePost.create({
    data: {
      coverUrl: savedCover?.url ?? null,
      coverName: savedCover?.name ?? null,
      date,
      clientId: client.id,
      clientName: client.name,
      title,
      text,
      time,
      kind,
      createdById: user.id,
      images: {
        create: saved.map((s, position) => ({
          url: s.url,
          name: s.name,
          position,
          mediaType: s.mediaType,
        })),
      },
    },
  });
  revalidatePath("/paylasim-takvimi");
}

export async function updateSharePost(id: string, formData: FormData) {
  const user = await requireEditor();
  const post = await prisma.sharePost.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!post) throw new Error("Paylaşım bulunamadı.");
  await assertClientInScope(user, post.clientId);
  assertNotMetaLocked(post);

  const { date, client, title, text, time, kind, files, order, cover, removeCover } = await parseForm(formData);
  await assertClientInScope(user, client.id);

  // Sıra gönderilmemişse: mevcut görseller kalır, yeniler sona eklenir.
  const tokens = order ?? [...post.images.map((i) => `e:${i.id}`), ...files.map((_, i) => `n:${i}`)];

  const existingById = new Map(post.images.map((i) => [i.id, i]));
  const plan: ({ kind: "keep"; id: string } | { kind: "new"; file: File })[] = [];
  for (const t of tokens) {
    if (t.startsWith("e:") && existingById.has(t.slice(2))) {
      plan.push({ kind: "keep", id: t.slice(2) });
    } else if (t.startsWith("n:") && files[Number(t.slice(2))]) {
      plan.push({ kind: "new", file: files[Number(t.slice(2))] });
    }
  }

  if (plan.length > MAX_IMAGES) throw new Error(`En fazla ${MAX_IMAGES} görsel ekleyebilirsin.`);
  if (plan.length === 0 && !text && !title) {
    throw new Error("En az bir başlık, görsel veya paylaşım metni bırakın.");
  }

  // Yeni dosyalar önce kaydedilir; bir şey ters giderse eski görseller bozulmaz.
  const newFiles = plan.flatMap((p) => (p.kind === "new" ? [p.file] : []));
  const uploaded = await storeShareImages(newFiles, {
    client,
    date,
    title,
    userId: user.id,
    offset: plan.length - newFiles.length,
  });
  let uploadedIdx = 0;
  const savedNew = plan.map((p) => (p.kind === "new" ? uploaded[uploadedIdx++] : null));

  const keptIds = new Set(plan.flatMap((p) => (p.kind === "keep" ? [p.id] : [])));
  const removed = post.images.filter((i) => !keptIds.has(i.id));

  // Reels kapağı: yeni seçildiyse değişir; tür Reels değilse ya da kaldırıldıysa silinir.
  const savedCover = kind === "REEL" && cover ? await storeCover(cover, { client, date, title, userId: user.id }) : null;
  const dropCover = !!post.coverUrl && (kind !== "REEL" || removeCover || !!savedCover);
  const coverData = savedCover
    ? { coverUrl: savedCover.url, coverName: savedCover.name }
    : dropCover
      ? { coverUrl: null, coverName: null }
      : {};

  await prisma.$transaction(async (tx) => {
    await tx.sharePost.update({
      where: { id },
      data: {
        date,
        clientId: client.id,
        clientName: client.name,
        title,
        text,
        time,
        kind,
        ...coverData,
        // Tarih / saat değişince hatırlatma yeniden gönderilebilsin.
        ...(date !== post.date || time !== post.time ? { reminderSentAt: null } : {}),
      },
    });
    if (removed.length > 0) {
      await tx.sharePostImage.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    }
    for (const [position, p] of plan.entries()) {
      if (p.kind === "keep") {
        await tx.sharePostImage.update({ where: { id: p.id }, data: { position } });
      } else {
        const s = savedNew[position]!;
        await tx.sharePostImage.create({
          data: { postId: id, url: s.url, name: s.name, position, mediaType: s.mediaType },
        });
      }
    }
  });

  await Promise.all(removed.map((r) => deleteUploadedFile(r.url)));
  if (dropCover && post.coverUrl) await deleteUploadedFile(post.coverUrl);
  revalidatePath("/paylasim-takvimi");
}

export async function deleteSharePost(id: string) {
  const user = await requireEditor();
  const post = await prisma.sharePost.findUnique({ where: { id }, include: { images: true } });
  if (!post) return;
  await assertClientInScope(user, post.clientId);
  if (post.metaStatus === "PUBLISHING") throw new Error("Bu paylaşım şu an Meta'da paylaşılıyor; bitince tekrar deneyin.");
  await prisma.sharePost.delete({ where: { id } });
  await Promise.all(post.images.map((i) => deleteUploadedFile(i.url)));
  if (post.coverUrl) await deleteUploadedFile(post.coverUrl);
  revalidatePath("/paylasim-takvimi");
}

/** Müşterinin Paylaşım Takvimi rengini ayarlar; null = otomatik renge dön. */
export async function setClientShareColor(clientId: string, color: string | null) {
  await assertClientInScope(await requireEditor(), clientId);
  if (color !== null && !HEX_COLOR_RE.test(color)) throw new Error("Geçersiz renk.");
  await prisma.client.update({ where: { id: clientId }, data: { shareColor: color } });
  revalidatePath("/paylasim-takvimi");
}

// ---- İş ekranından "Paylaşım takvimine gönder" ----------------------------


export type SendTargetPost = { id: string; date: string; title: string | null; imageCount: number };
export type SendOptions = {
  clientId: string | null;
  clientName: string | null;
  /** İşin müşterisi yoksa seçilebilecek müşteriler. */
  clients: { id: string; name: string }[];
  /** Bu müşterinin yakın tarihli / gelecek paylaşımları (mevcut paylaşıma ekleme için). */
  posts: SendTargetPost[];
  today: string;
};

/** Gönder penceresi için: müşteri ve o müşterinin takvimdeki paylaşımları. */
async function buildSendOptions(
  user: SessionUser,
  clientId: string | null,
  clientName: string | null
): Promise<SendOptions> {
  const scope = await getClientScope(user);
  const today = uploadMonth().iso;
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 14);
  const sinceIso = since.toISOString().slice(0, 10);

  const [posts, clients] = await Promise.all([
    clientId
      ? prisma.sharePost.findMany({
          where: { clientId, date: { gte: sinceIso } },
          orderBy: { date: "asc" },
          take: 40,
          select: { id: true, date: true, title: true, _count: { select: { images: true } } },
        })
      : Promise.resolve([]),
    clientId
      ? Promise.resolve([])
      : prisma.client.findMany({
          where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
  ]);

  return {
    clientId,
    clientName,
    clients,
    posts: posts.map((p) => ({ id: p.id, date: p.date, title: p.title, imageCount: p._count.images })),
    today,
  };
}

/** İş ekranındaki gönder penceresi için seçenekler. */
export async function getSendOptions(taskId: string): Promise<SendOptions> {
  const { user } = await requireSender(taskId);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { clientId: true, client: { select: { name: true } } },
  });
  if (!task) throw new Error("İş bulunamadı.");
  return buildSendOptions(user, task.clientId, task.client?.name ?? null);
}

/** İçerik tablosundaki onaylı satır için gönder penceresi seçenekleri. */
export async function getItemSendOptions(itemId: string): Promise<SendOptions> {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: { clientId: true, client: { select: { name: true } } },
  });
  if (!item) throw new Error("İçerik bulunamadı.");
  const { user } = await requireClientSender(item.clientId);
  return buildSendOptions(user, item.clientId, item.client.name);
}

export type SendInput = {
  taskId: string;
  /** Gönderilecek dosyalar (`/api/files/<id>` adresleri), kaydırma sırasıyla. */
  fileUrls: string[];
  mode: "new" | "existing";
  /** mode = existing */
  postId?: string;
  /** mode = new */
  date?: string;
  title?: string;
  text?: string;
  /** İşin müşterisi yoksa. */
  clientId?: string;
  /** mode = new: paylaşım saati "HH:MM" (boş olabilir) ve türü. */
  time?: string;
  kind?: ShareKind;
};

type StoredMedia = StoredFile;

/** Görselleri paylaşım takvimine yerleştirir: mevcut paylaşıma ekler ya da yeni paylaşım açar. */
async function placeFilesInCalendar(opts: {
  input: Pick<SendInput, "mode" | "postId" | "date" | "title" | "text" | "clientId" | "time" | "kind">;
  user: SessionUser;
  leadOnly: boolean;
  /** Dosyaların bağlı olduğu müşteri (yoksa input.clientId'den seçilir). */
  clientId: string | null;
  defaultTitle: string;
  images: StoredMedia[];
}) {
  const { input, user, leadOnly, clientId: sourceClientId, defaultTitle, images } = opts;
  const scope = await getClientScope(user);

  if (input.mode === "existing") {
    const post = await prisma.sharePost.findUnique({
      where: { id: input.postId ?? "" },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!post) throw new Error("Paylaşım bulunamadı.");
    if (leadOnly && post.clientId !== sourceClientId) throw new Error("Bu paylaşım başka bir müşteriye ait.");
    if (!inClientScope(scope, post.clientId)) throw new Error("Bu paylaşım sorumlu olmadığınız bir müşteriye ait.");
    assertNotMetaLocked(post);

    const have = new Set(post.images.map((i) => i.url));
    const fresh = images.filter((f) => !have.has(`/api/files/${f.id}`));
    if (post.images.length + fresh.length > MAX_IMAGES) {
      throw new Error(`Bir paylaşımda en fazla ${MAX_IMAGES} görsel olabilir.`);
    }
    if (fresh.length > 0) {
      await prisma.sharePostImage.createMany({
        data: fresh.map((f, i) => ({
          postId: post.id,
          url: `/api/files/${f.id}`,
          name: f.name,
          position: post.images.length + i,
          mediaType: f.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
        })),
      });
    }
    revalidatePath("/paylasim-takvimi");
    return { postId: post.id, date: post.date, added: fresh.length, skipped: images.length - fresh.length };
  }

  const date = String(input.date ?? "");
  if (!SHARE_DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new Error("Geçerli bir tarih seçin.");
  const clientId = leadOnly ? (sourceClientId ?? "") : (sourceClientId ?? input.clientId ?? "");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) throw new Error("Müşteri seçin.");
  if (!inClientScope(scope, client.id)) throw new Error("Sadece sorumlu olduğunuz müşterinin takvimine gönderebilirsiniz.");

  const post = await prisma.sharePost.create({
    data: {
      date,
      clientId: client.id,
      clientName: client.name,
      title: (input.title ?? defaultTitle).trim().slice(0, 120) || null,
      text: input.text?.split(String.fromCharCode(13)).join("").trim() || null,
      time: parseShareTime(input.time),
      kind: parseShareKind(input.kind),
      createdById: user.id,
      images: {
        create: images.map((f, position) => ({
          url: `/api/files/${f.id}`,
          name: f.name,
          position,
          mediaType: f.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
        })),
      },
    },
  });
  revalidatePath("/paylasim-takvimi");
  return { postId: post.id, date, added: images.length, skipped: 0 };
}

/** Drive'daki görselleri kopyalamadan paylaşım takvimine bağlar (referans). */
export async function sendFilesToSharePost(input: SendInput) {
  const { user, leadOnly } = await requireSender(input.taskId);
  const { ids, images } = await resolveMediaFiles(user, input.fileUrls);

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { title: true, clientId: true },
  });
  if (!task) throw new Error("İş bulunamadı.");

  // Sadece çalışanın teslim ettiği dosyalar gönderilebilir; işi verenin eklediği referans dosyalar
  // (ve müşterinin referansları) paylaşım takvimine gitmez.
  await assertTaskDelivered(input.taskId, ids);

  return placeFilesInCalendar({ input, user, leadOnly, clientId: task.clientId, defaultTitle: task.title, images });
}

export type ItemSendInput = Omit<SendInput, "taskId" | "fileUrls" | "clientId"> & { itemId: string };

/** İçerik tablosunda müşterinin ONAYLADIĞI teslimi paylaşım takvimine gönderir (yönetici / müşteri sorumlusu). */
export async function sendItemToSharePost(input: ItemSendInput) {
  const item = await prisma.contentItem.findUnique({
    where: { id: input.itemId },
    select: { title: true, clientId: true, deliveryStatus: true, deliveryFiles: { orderBy: { position: "asc" }, select: { url: true } } },
  });
  if (!item) throw new Error("İçerik bulunamadı.");
  const { user, leadOnly } = await requireClientSender(item.clientId);
  if (item.deliveryStatus !== "APPROVED") throw new Error("Sadece müşterinin onayladığı içerik paylaşım takvimine gönderilebilir.");
  if (item.deliveryFiles.length === 0) throw new Error("Gönderilecek görsel yok.");

  const { images } = await resolveMediaFiles(user, item.deliveryFiles.map((f) => f.url));
  return placeFilesInCalendar({
    input,
    user,
    leadOnly,
    clientId: item.clientId,
    defaultTitle: item.title,
    images,
  });
}

/** Takvimde bir paylaşımı sürükleyip başka güne bırakınca: sadece tarih değişir (saat, görseller, metin aynı kalır). */
export async function moveSharePost(id: string, date: string) {
  const user = await requireEditor();
  if (!SHARE_DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new Error("Geçerli bir tarih seçin.");
  const post = await prisma.sharePost.findUnique({ where: { id }, select: { id: true, date: true, metaStatus: true, clientId: true } });
  if (!post) throw new Error("Paylaşım bulunamadı.");
  await assertClientInScope(user, post.clientId);
  if (post.date === date) return;
  assertNotMetaLocked(post);
  await prisma.sharePost.update({
    where: { id },
    // Tarih değişince hatırlatma yeniden gönderilebilsin.
    data: { date, reminderSentAt: null },
  });
  revalidatePath("/paylasim-takvimi");
  revalidatePath("/panel/takvim");
}

/** "Paylaşıldı" işareti. Paylaşım takvimini görebilen her ekip üyesi işaretleyebilir (paylaşımı yapan kişi düzenleme
 * yetkisi olmayan "kullanım" yetkilisi de olabilir). "Meta'da planlandı" artık elle işaretlenmez: bkz. actions/metaSchedule.ts. */
export async function setShareStatus(id: string, input: { published?: boolean }) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Yetkisiz.");
  if (!canViewShareCalendar(await getShareAccess(session.user))) throw new Error("Paylaşım takvimi yetkiniz yok.");

  const post = await prisma.sharePost.findUnique({ where: { id }, select: { id: true, metaStatus: true, clientId: true } });
  if (!post) throw new Error("Paylaşım bulunamadı.");
  await assertClientInScope(session.user, post.clientId);
  assertNotMetaLocked(post);

  await prisma.sharePost.update({
    where: { id },
    data: {
      ...(input.published === undefined
        ? {}
        : input.published
          ? { publishedAt: new Date(), publishedById: session.user.id }
          : { publishedAt: null, publishedById: null }),
    },
  });
  revalidatePath("/paylasim-takvimi");
  revalidatePath("/panel/takvim");
}
