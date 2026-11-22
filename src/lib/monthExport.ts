import path from "node:path";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { Zip, ZipPassThrough } from "fflate";
import { prisma } from "@/lib/prisma";
import { downloadFromDrive, getDriveConfig, type DriveConfig } from "@/lib/drive";

// Bir müşterinin seçilen ayda tamamlanan işlerinin teslim dosyalarını, her iş kendi klasöründe olacak şekilde tek zip yapar.

export type ExportFile = { url: string; fileName: string };
export type ExportJob = { taskId: string; title: string; folder: string; files: ExportFile[] };

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
/** Türkiye saati (UTC+3, yaz saati yok): ayın başı / sonu. */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

export function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1) - TR_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - TR_OFFSET_MS);
  return { start, end };
}

/** Klasör / dosya adında kullanılamayacak karakterleri temizler. */
export function safeName(raw: string, max = 80) {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/…$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  const cut = cleaned.length > max ? cleaned.slice(0, max).trimEnd() : cleaned;
  return cut || "İş";
}

/** Seçilen ayda tamamlanan ve teslim dosyası olan işler; klasör adları benzersizdir. */
export async function loadMonthExport(clientId: string, year: number, month: number): Promise<ExportJob[]> {
  const { start, end } = monthRange(year, month);
  const tasks = await prisma.task.findMany({
    where: { clientId, status: "DONE", completedAt: { gte: start, lt: end } },
    orderBy: { completedAt: "asc" },
    select: {
      id: true,
      title: true,
      submissions: {
        where: { fileUrl: { not: null } },
        orderBy: [{ position: "asc" }, { uploadedAt: "asc" }],
        select: { fileUrl: true, fileName: true },
      },
    },
  });

  const used = new Map<string, number>();
  const jobs: ExportJob[] = [];
  for (const t of tasks) {
    const files = t.submissions.flatMap((s) => (s.fileUrl ? [{ url: s.fileUrl, fileName: s.fileName }] : []));
    if (files.length === 0) continue;
    const base = safeName(t.title);
    const key = base.toLocaleLowerCase("tr");
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    jobs.push({ taskId: t.id, title: t.title, folder: n === 1 ? base : `${base} (${n})`, files });
  }
  return jobs;
}

/** Klasördeki dosya adları: birden fazlaysa kaydırma sırası korunsun diye "01 - ad.png" biçiminde numaralanır. */
export function entryNames(job: ExportJob) {
  const seen = new Map<string, number>();
  return job.files.map((f, i) => {
    const clean = safeName(f.fileName, 120);
    let name = job.files.length > 1 ? `${String(i + 1).padStart(2, "0")} - ${clean}` : clean;
    const k = name.toLocaleLowerCase("tr");
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) name = name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
    return `${job.folder}/${name}`;
  });
}

/** Dosyanın içeriğini akış olarak açar (Drive ya da eski sunucu diski). Bulunamazsa null. */
async function openFile(url: string, config: DriveConfig | null): Promise<ReadableStream<Uint8Array> | null> {
  const drive = url.match(/^\/api\/files\/([^/?]+)/);
  if (drive) {
    if (!config) return null;
    const stored = await prisma.storedFile.findUnique({ where: { id: drive[1] }, select: { driveFileId: true } });
    if (!stored) return null;
    const res = await downloadFromDrive(config, stored.driveFileId);
    return res.ok && res.body ? (res.body as ReadableStream<Uint8Array>) : null;
  }
  const local = url.match(/^\/api\/uploads\/submissions\/([^/?]+)$/);
  if (local) {
    const filePath = path.resolve(process.cwd(), UPLOAD_DIR, "submissions", local[1]);
    try {
      return Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Zip'i parça parça üretir: dosyalar sırayla okunur, bellekte hepsi birden tutulmaz. Sıkıştırılmaz (görsel/video zaten sıkışık). */
export function buildZipStream(jobs: ExportJob[]): ReadableStream<Uint8Array> {
  const out: Uint8Array[] = [];
  let ended = false;
  let failure: unknown = null;
  const zip = new Zip((err, chunk, final) => {
    if (err) failure = err;
    else {
      out.push(chunk);
      if (final) ended = true;
    }
  });

  async function* feed() {
    const config = await getDriveConfig().catch(() => null);
    const missing: string[] = [];
    for (const job of jobs) {
      const names = entryNames(job);
      for (const [i, f] of job.files.entries()) {
        const body = await openFile(f.url, config).catch(() => null);
        if (!body) {
          missing.push(`${names[i]}`);
          continue;
        }
        const entry = new ZipPassThrough(names[i]);
        zip.add(entry);
        const reader = body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length > 0) {
              entry.push(value, false);
              yield;
            }
          }
        } finally {
          entry.push(new Uint8Array(0), true);
        }
        yield;
      }
    }
    if (missing.length > 0) {
      const note = new ZipPassThrough("EKSIK DOSYALAR.txt");
      zip.add(note);
      note.push(
        new TextEncoder().encode("Aşağıdaki dosyalar sunucudan alınamadığı için pakete eklenemedi:\r\n\r\n" + missing.join("\r\n")),
        true
      );
    }
    zip.end();
  }

  const it = feed();
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (out.length === 0 && !ended && !failure) {
          const r = await it.next();
          if (r.done) {
            finished = true;
            break;
          }
        }
        if (failure) throw failure;
        while (out.length > 0) controller.enqueue(out.shift()!);
        if (ended || (finished && out.length === 0)) controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      void it.return(undefined);
    },
  });
}
