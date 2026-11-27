// Canlı gelen kutusu (Server-Sent Events). Kullanıcı yalnızca yetkili olduğu müşterinin olaylarını alır.
// Nginx tamponlamasın diye "X-Accel-Buffering: no" gönderilir (sunucu ayarı değiştirmeden çalışır).
import { auth } from "@/auth";
import { requireDmActor } from "@/lib/dm/access";
import { subscribeDmEvents } from "@/lib/dm/liveListener";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Yetkisiz", { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") ?? "";
  try {
    await requireDmActor(session.user, clientId, { allowClient: true });
  } catch {
    return new Response("Yetkisiz", { status: 403 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const write = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          cleanup();
        }
      };
      write(`retry: 5000\n\n`);
      let unsubscribe = () => {};
      try {
        unsubscribe = await subscribeDmEvents((ev) => {
          if (ev.clientId === clientId) write(`data: ${JSON.stringify({ kind: ev.kind, conversationId: ev.conversationId ?? null })}\n\n`);
        });
      } catch {
        write(`event: error\ndata: "canlı akış kurulamadı"\n\n`);
      }
      const heartbeat = setInterval(() => write(`: ping\n\n`), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // zaten kapalı
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
