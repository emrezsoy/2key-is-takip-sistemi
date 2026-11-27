// dm-worker zamanlayıcısı (dakikada bir çağrılır). Her görev kendi aralığını tutar.
import { pruneJobs, releaseStuckJobs } from "./queue";
import { runCreditTick } from "./subscription";

type Task = { name: string; everyMs: number; run: (now: Date) => Promise<void> };

const tasks: Task[] = [
  { name: "takılı işler", everyMs: 60_000, run: () => releaseStuckJobs() },
  { name: "kredi", everyMs: 10 * 60_000, run: (now) => runCreditTick(now) },
  { name: "kuyruk temizliği", everyMs: 6 * 3600_000, run: () => pruneJobs() },
];

const lastRun = new Map<string, number>();

export function registerScheduledTask(task: Task) {
  tasks.push(task);
}

export async function runScheduler(now: Date) {
  for (const t of tasks) {
    const last = lastRun.get(t.name) ?? 0;
    if (now.getTime() - last < t.everyMs) continue;
    lastRun.set(t.name, now.getTime());
    try {
      await t.run(now);
    } catch (e) {
      console.error(`[dm-worker] zamanlanmış görev "${t.name}" hatası:`, e instanceof Error ? e.message : e);
    }
  }
}
