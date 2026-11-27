import http from "node:http";
import os from "node:os";
import { prisma } from "@/lib/prisma";
import { verifyMetaSignature } from "@/lib/dm/channels/metaParse";
import { isFakeChannel } from "@/lib/dm/channels";
import { getDmApp, getDmVerifyToken } from "@/lib/dm/metaDm";
import { claimJobs, completeJob, enqueue, failJob, queueStats } from "@/lib/dm/queue";
import { getJobHandler } from "@/lib/dm/jobs";
import { runScheduler } from "@/lib/dm/scheduler";
import "@/lib/dm/registerJobs";

const PORT = Number(process.env.DM_WORKER_PORT ?? 3005);
const WORKER_ID = `${os.hostname()}:${process.pid}`;
const MAX_BODY = 2 * 1024 * 1024;
const CONCURRENCY = 4;

const state = { startedAt: new Date(), lastTickAt: null as Date | null, lastJobAt: null as Date | null, running: 0, stopping: false };

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("Gövde çok büyük");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    return send(res, 200, {
      ok: true,
      mode: isFakeChannel() ? "fake" : "meta",
      startedAt: state.startedAt,
      lastTickAt: state.lastTickAt,
      lastJobAt: state.lastJobAt,
      running: state.running,
      queue: await queueStats(),
    });
  }

  if (url.pathname === "/api/dm/webhook" && req.method === "GET") {
    // Meta webhook doğrulaması.
    const verify = await getDmVerifyToken();
    const ok = url.searchParams.get("hub.mode") === "subscribe" && !!verify && url.searchParams.get("hub.verify_token") === verify;
    return ok ? send(res, 200, url.searchParams.get("hub.challenge") ?? "", "text/plain") : send(res, 403, "Forbidden", "text/plain");
  }

  if (url.pathname === "/api/dm/webhook" && req.method === "POST") {
    const secret = (await getDmApp()).appSecret;
    if (!secret) return send(res, 503, { error: "App Secret tanımlı değil" });
    let raw: Buffer;
    try {
      raw = await readBody(req);
    } catch {
      return send(res, 413, { error: "too large" });
    }
    if (!verifyMetaSignature(raw, req.headers["x-hub-signature-256"] as string | undefined, secret)) {
      return send(res, 401, { error: "imza geçersiz" });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      return send(res, 400, { error: "geçersiz JSON" });
    }
    // Hemen kaydet ve 200 dön; işleme kuyrukta (Meta 5 sn içinde cevap bekler).
    await enqueue("INGEST", { body } as never);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: "bulunamadı" });
}

async function runJobs() {
  if (state.stopping || state.running >= CONCURRENCY) return;
  const jobs = await claimJobs(WORKER_ID, CONCURRENCY - state.running);
  for (const job of jobs) {
    state.running++;
    void (async () => {
      try {
        const handler = getJobHandler(job.type);
        if (!handler) throw new Error(`İşleyici yok: ${job.type}`);
        await handler((job.payload ?? {}) as Record<string, unknown>, job);
        await completeJob(job.id);
      } catch (e) {
        console.error(`[dm-worker] ${job.type} hata:`, e instanceof Error ? e.message : e);
        const retry = !(e && typeof e === "object" && "retryable" in e && (e as { retryable: boolean }).retryable === false);
        await failJob(job, e, { retry }).catch(() => {});
      } finally {
        state.running--;
        state.lastJobAt = new Date();
      }
    })();
  }
}

export async function start() {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error("[dm-worker] istek hatası:", e instanceof Error ? e.message : e);
      if (!res.headersSent) send(res, 500, { error: "sunucu hatası" });
    });
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[dm-worker] ${PORT} portunda (${isFakeChannel() ? "SAHTE kanal: mesajlar Meta'ya gitmez" : "META"})`);
  });

  const jobTimer = setInterval(() => void runJobs().catch((e) => console.error("[dm-worker] kuyruk:", e)), 700);
  const tick = async () => {
    try {
      await runScheduler(new Date());
      state.lastTickAt = new Date();
    } catch (e) {
      console.error("[dm-worker] zamanlayıcı:", e instanceof Error ? e.message : e);
    }
  };
  void tick();
  const tickTimer = setInterval(() => void tick(), 60_000);

  const stop = async () => {
    if (state.stopping) return;
    state.stopping = true;
    clearInterval(jobTimer);
    clearInterval(tickTimer);
    server.close();
    for (let i = 0; i < 50 && state.running > 0; i++) await new Promise((r) => setTimeout(r, 200));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
