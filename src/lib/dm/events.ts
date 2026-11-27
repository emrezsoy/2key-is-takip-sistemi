// Canlı gelen kutusu: worker / web bir mesaj yazınca Postgres NOTIFY ile haber verir; web süreci SSE ile tarayıcıya iletir.
import { prisma } from "@/lib/prisma";

export const DM_CHANNEL = "dm_events";

export type DmLiveEvent = { clientId: string; conversationId?: string; kind: "message" | "conversation" | "pending" | "credit" };

export async function publishDmEvent(ev: DmLiveEvent) {
  try {
    await prisma.$executeRaw`SELECT pg_notify(${DM_CHANNEL}, ${JSON.stringify(ev)})`;
  } catch (e) {
    console.error("dm_events yayınlanamadı:", e instanceof Error ? e.message : e);
  }
}
