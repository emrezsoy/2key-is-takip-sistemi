import { NextResponse } from "next/server";
import { finishRadioTrack, getRadioControls, getRadioQueue, markRadioTvSeen, verifyRadioTvToken } from "@/lib/radio";

// Ofisteki TV ekranının (Mi Stick) giriş yapmadan, gizli bağlantıyla konuştuğu adres.
// GET: çalınacak şarkı + sıra + duraklat/ses durumu. POST: şarkı bitti / oynatılamadı bildirimi.

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!(await verifyRadioTvToken(token))) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 403 });
  await markRadioTvSeen();
  const [{ current, queue }, controls] = await Promise.all([getRadioQueue(), getRadioControls()]);
  const pick = (t: NonNullable<typeof current>) => ({
    id: t.id,
    videoId: t.videoId,
    title: t.title,
    channel: t.channel,
    addedByName: t.addedByName,
  });
  return NextResponse.json(
    {
      paused: controls.paused,
      volume: controls.volume,
      current: current ? pick(current) : null,
      queue: queue.slice(0, 6).map(pick),
      queueCount: queue.length,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  if (!(await verifyRadioTvToken(token))) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { trackId?: string; event?: string; code?: number } | null;
  if (!body?.trackId || (body.event !== "ended" && body.event !== "error")) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  await markRadioTvSeen();
  if (body.event === "error") console.warn(`[radyo] şarkı oynatılamadı: ${body.trackId} (YouTube hata kodu ${body.code ?? "?"})`);
  const changed = await finishRadioTrack(body.trackId, body.event === "ended" ? "PLAYED" : "FAILED");
  return NextResponse.json({ ok: true, changed });
}
