// dm-worker iş işleyicileri (iş türü → fonksiyon). Her işleyici tekrar çalıştırılmaya dayanıklı (idempotent) olmalıdır.
import type { DmJob } from "@prisma/client";
import { parseMetaWebhook } from "./channels/metaParse";
import type { DmInboundEvent } from "./channels/types";
import { handleEchoCheck, ingestEvents } from "./ingest";

export type JobHandler = (payload: Record<string, unknown>, job: DmJob) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  async INGEST(payload) {
    await ingestEvents(parseMetaWebhook(payload.body));
  },
  async ECHO_CHECK(payload) {
    const ev = payload.event as DmInboundEvent;
    await handleEchoCheck({ ...ev, timestamp: new Date(ev.timestamp) });
  },
};

export function registerJobHandler(type: string, fn: JobHandler) {
  handlers[type] = fn;
}

export const getJobHandler = (type: string): JobHandler | undefined => handlers[type];
