// Worker'ın kullandığı iş işleyicilerini ve zamanlanmış görevleri kaydeder (yan etki için içe aktarılır).
import { prisma } from "@/lib/prisma";
import { registerJobHandler } from "./jobs";
import { processBatch } from "./engine";
import { analyzeMedia } from "./media";
import { sendOwnerAnswer } from "./ownerQuestions";
import { sendAppointmentUpdate } from "./appointments";
import { syncStore } from "./products";
import { runOnboardingAnalysis } from "./onboarding";
import { enqueue } from "./queue";
import { fetchContactProfile } from "./ingest";
import { registerScheduledTask } from "./scheduler";
import "./modules";
import "./followups";
import type { MediaKey } from "./mediaKeys";

registerJobHandler("PROCESS_BATCH", async (p, job) => processBatch(String(p.conversationId), job.attempts));
registerJobHandler("ANALYZE_MEDIA", async (p) =>
  analyzeMedia(p as { clientId: string; messageId?: string; key: string; kind: MediaKey["kind"]; url?: string; title?: string })
);
registerJobHandler("SEND_OWNER_ANSWER", async (p) => sendOwnerAnswer(String(p.questionId)));
registerJobHandler("SEND_APPOINTMENT_UPDATE", async (p) => sendAppointmentUpdate(String(p.appointmentId), p.decision as "CONFIRM" | "REJECT" | "PROPOSE"));
registerJobHandler("SYNC_PRODUCTS", async (p) => syncStore(String(p.connectionId)));
registerJobHandler("ONBOARDING_ANALYSIS", async (p) => runOnboardingAnalysis(String(p.id)));
registerJobHandler("FETCH_PROFILE", async (p) => fetchContactProfile(String(p.contactId)));

// Mağaza kataloğu 6 saatte bir senkronlanır (elle girilenler hariç).
registerScheduledTask({
  name: "ürün senkronu",
  everyMs: 6 * 3600_000,
  run: async () => {
    const conns = await prisma.dmStoreConnection.findMany({ where: { isActive: true, platform: { not: "MANUAL" }, client: { dmManaged: true, dmModuleProducts: true } } });
    for (const c of conns) await enqueue("SYNC_PRODUCTS", { connectionId: c.id }, { dedupeKey: `sync:${c.id}` });
  },
});
