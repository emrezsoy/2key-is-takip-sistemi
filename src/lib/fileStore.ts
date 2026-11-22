import { driveIfConfigured, saveFilesToDrive, uploadMonth } from "@/lib/driveStorage";
import { saveSubmissionFile, saveTaskFile, validateShareMedia, validateUploadFile } from "@/lib/storage";

type StoredRef = { url: string; name: string; size: number };

type TaskFileContext = {
  /** Müşterisiz işler "Müşterisiz" klasörüne gider. */
  client: { id: string | null; name: string };
  taskTitle: string;
  uploadedById: string;
};

const clientOrNone = (c: TaskFileContext["client"]) => (c.id ? c : { id: null, name: "Müşterisiz" });

/** Bir işe eklenen dosya (yönetici/sorumlu tarafından). Drive bağlıysa "<Müşteri>/<Ay Yıl>" klasörüne gider. */
export async function storeTaskAttachment(file: File, ctx: TaskFileContext): Promise<StoredRef> {
  validateUploadFile(file);
  const config = await driveIfConfigured();
  if (!config) return saveTaskFile(file);

  const client = clientOrNone(ctx.client);
  const [saved] = await saveFilesToDrive(
    config,
    [file],
    { client, kind: "TASK", uploadedById: ctx.uploadedById },
    () => `${uploadMonth().iso} ${client.name} - ${ctx.taskTitle} - Ek`
  );
  return { url: saved.url, name: file.name, size: file.size };
}

/** Form verisinden yüklenen dosyalar ("files" çoklu; eski tekli "file" alanı da desteklenir). */
export const uploadedFilesOf = (fd: FormData) =>
  [...fd.getAll("files"), ...fd.getAll("file")].filter((f): f is File => f instanceof File && f.size > 0);

/** İşe eklenen birden çok referans dosyası (yönetici/sorumlu). Drive bağlıysa "<Müşteri>/<Ay Yıl>" klasörüne gider. */
export const MAX_TASK_ATTACHMENTS = 20;

export async function storeTaskAttachments(files: File[], ctx: TaskFileContext): Promise<StoredRef[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_TASK_ATTACHMENTS) throw new Error(`En fazla ${MAX_TASK_ATTACHMENTS} dosya eklenebilir.`);
  files.forEach(validateUploadFile);
  const config = await driveIfConfigured();
  if (!config) return Promise.all(files.map((f) => saveTaskFile(f)));

  const client = clientOrNone(ctx.client);
  const saved = await saveFilesToDrive(
    config,
    files,
    { client, kind: "TASK", uploadedById: ctx.uploadedById },
    (_f, i) => `${uploadMonth().iso} ${client.name} - ${ctx.taskTitle} - Referans${files.length > 1 ? ` ${i + 1}` : ""}`
  );
  return saved.map((s, i) => ({ url: s.url, name: files[i].name, size: files[i].size }));
}

/** Çalışanın işi teslim ederken yüklediği dosyalar. Drive'a giderse kalıcıdır (3 gün sonra silinmez). */
export async function storeSubmissionFiles(
  files: File[],
  ctx: TaskFileContext & { uploaderName: string }
): Promise<StoredRef[]> {
  files.forEach(validateUploadFile);
  const config = await driveIfConfigured();
  if (!config) return Promise.all(files.map((f) => saveSubmissionFile(f)));

  const client = clientOrNone(ctx.client);
  const saved = await saveFilesToDrive(
    config,
    files,
    { client, kind: "SUBMISSION", uploadedById: ctx.uploadedById },
    (_f, i) =>
      `${uploadMonth().iso} ${client.name} - ${ctx.taskTitle} - ${ctx.uploaderName} - ${i + 1}`
  );
  return saved.map((s, i) => ({ url: s.url, name: files[i].name, size: files[i].size }));
}

/** Müşterinin (veya ekibin) talep / içerik satırına eklediği referans görsel ve videolar (çoklu).
 * Sadece Drive'a yüklenir ("<Müşteri>/<Ay Yıl>" klasörü); Drive bağlı değilse hata verir. */
export async function storeClientMedias(
  files: File[],
  ctx: {
    client: { id: string; name: string };
    kind: "REQUEST" | "CONTENT";
    label: string;
    uploadedById: string;
    /** Sadece görsel kabul edilsin (metin editörü). */
    imagesOnly?: boolean;
  }
): Promise<{ url: string; name: string; size: number; mediaType: "IMAGE" | "VIDEO" }[]> {
  const types = files.map((f) => validateShareMedia(f));
  if (ctx.imagesOnly && types.includes("VIDEO")) throw new Error("Metne sadece görsel eklenebilir.");
  const config = await driveIfConfigured();
  if (!config) throw new Error("Dosya yükleme şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.");
  const saved = await saveFilesToDrive(
    config,
    files,
    { client: ctx.client, kind: ctx.kind, uploadedById: ctx.uploadedById },
    (_f, i) => `${uploadMonth().iso} ${ctx.client.name} - ${ctx.label}${files.length > 1 ? ` - ${i + 1}` : ""}`
  );
  return saved.map((s, i) => ({ url: s.url, name: files[i].name, size: files[i].size, mediaType: types[i] }));
}

export const MAX_CLIENT_FILES = 10;
