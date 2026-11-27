// dm-worker kuyruğu: Postgres tablosu (DmJob), SELECT ... FOR UPDATE SKIP LOCKED ile alınır. Redis yok.
// dedupeKey yalnızca BEKLEYEN iş için tekildir: iş alınınca anahtar boşaltılır, böylece iş çalışırken gelen yeni
// mesaj için yeni bir bekleyen iş açılabilir (çalışan iş, yarış korumasıyla kendini iptal eder).
import type { DmJob, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DmJobType =
  | "INGEST"
  | "PROCESS_BATCH"
  | "ANALYZE_MEDIA"
  | "ECHO_CHECK"
  | "SEND_OWNER_ANSWER"
  | "SEND_APPOINTMENT_UPDATE"
  | "SEND_FOLLOWUP"
  | "SYNC_PRODUCTS"
  | "ONBOARDING_ANALYSIS"
  | "FETCH_PROFILE";

/** İş ekler. dedupeKey varsa ve aynı anahtarlı bekleyen iş varsa onun zamanını günceller (yenisini açmaz). */
export async function enqueue(
  type: DmJobType,
  payload: Prisma.InputJsonValue,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number; keepEarlier?: boolean } = {}
): Promise<string> {
  const runAt = opts.runAt ?? new Date();
  if (opts.dedupeKey) {
    const existing = await prisma.dmJob.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing && existing.status === "PENDING") {
      const nextRun = opts.keepEarlier && existing.runAt < runAt ? existing.runAt : runAt;
      await prisma.dmJob.update({ where: { id: existing.id }, data: { runAt: nextRun, payload } });
      return existing.id;
    }
    try {
      const job = await prisma.dmJob.create({ data: { type, payload, runAt, dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 3 } });
      return job.id;
    } catch {
      // Aynı anda başka süreç eklediyse onunkini kullan.
      const again = await prisma.dmJob.findUnique({ where: { dedupeKey: opts.dedupeKey } });
      if (again) return again.id;
      throw new Error("Kuyruğa eklenemedi.");
    }
  }
  const job = await prisma.dmJob.create({ data: { type, payload, runAt, maxAttempts: opts.maxAttempts ?? 3 } });
  return job.id;
}

/** Zamanı gelmiş işleri kilitleyerek alır. */
export async function claimJobs(workerId: string, limit: number): Promise<DmJob[]> {
  return prisma.$queryRaw<DmJob[]>`
    UPDATE "DmJob" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1,
           "dedupeKey" = NULL, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "DmJob"
      WHERE status = 'PENDING' AND "runAt" <= now()
      ORDER BY "runAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING *`;
}

export async function completeJob(id: string) {
  await prisma.dmJob.update({ where: { id }, data: { status: "DONE", lockedAt: null, lastError: null } });
}

/** Başarısız iş: deneme hakkı varsa üstel bekleme ile yeniden sıraya girer. */
export async function failJob(job: DmJob, error: unknown, opts: { retry?: boolean } = {}) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  const canRetry = opts.retry !== false && job.attempts < job.maxAttempts;
  await prisma.dmJob.update({
    where: { id: job.id },
    data: canRetry
      ? { status: "PENDING", lockedAt: null, lastError: message, runAt: new Date(Date.now() + Math.min(300, 5 * 2 ** job.attempts) * 1000) }
      : { status: "FAILED", lockedAt: null, lastError: message },
  });
}

/** Çöken worker'dan kalan (10 dakikadan uzun süredir RUNNING) işleri geri alır. */
export async function releaseStuckJobs() {
  await prisma.dmJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "PENDING", lockedAt: null },
  });
}

/** Eski tamamlanmış işleri temizler (7 gün). */
export async function pruneJobs() {
  await prisma.dmJob.deleteMany({ where: { status: { in: ["DONE"] }, updatedAt: { lt: new Date(Date.now() - 7 * 864e5) } } });
}

export async function queueStats() {
  const rows = await prisma.dmJob.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}
