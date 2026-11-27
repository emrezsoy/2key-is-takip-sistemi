// Sesli kurulum: tarayıcı için kısa ömürlü OpenAI Realtime anahtarı üretir (ana anahtar tarayıcıya gitmez).
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireDmActor } from "@/lib/dm/access";
import { getAiKey } from "@/lib/dm/ai/settings";
import { onboardingInstructions } from "@/lib/dm/onboarding/checklist";

export const dynamic = "force-dynamic";

const REALTIME_MODEL = process.env.DM_REALTIME_MODEL ?? "gpt-realtime-2.1";
const VOICE = process.env.DM_REALTIME_VOICE ?? "marin";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Oturum yok" }, { status: 401 });
  const { onboardingId } = (await req.json().catch(() => ({}))) as { onboardingId?: string };
  const ob = onboardingId ? await prisma.dmOnboardingSession.findUnique({ where: { id: onboardingId } }) : null;
  if (!ob) return Response.json({ error: "Kurulum kaydı bulunamadı" }, { status: 404 });
  try {
    await requireDmActor(session.user, ob.clientId, { allowClient: true });
  } catch {
    return Response.json({ error: "Yetkisiz" }, { status: 403 });
  }
  if (!["DRAFT", "IN_CALL", "UPLOADS"].includes(ob.status)) return Response.json({ error: "Bu kurulum görüşmesi tamamlanmış." }, { status: 400 });
  const key = await getAiKey("openai");
  if (!key) return Response.json({ error: "OpenAI API anahtarı girilmemiş (Ayarlar → Mesaj Otomasyonu)." }, { status: 400 });

  const collected = (ob.fields ?? {}) as Record<string, string>;
  const body = {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: REALTIME_MODEL,
      instructions: onboardingInstructions(ob.ownerName, ob.businessName, collected),
      audio: {
        input: { transcription: { model: "gpt-4o-transcribe", language: "tr" }, turn_detection: { type: "semantic_vad", eagerness: "low" } },
        output: { voice: VOICE },
      },
      tools: [
        {
          type: "function",
          name: "save_field",
          description: "Kontrol listesindeki bir bilgiyi kaydeder.",
          parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] },
        },
        { type: "function", name: "end_call", description: "Vedalaştıktan sonra görüşmeyi bitirir.", parameters: { type: "object", properties: {} } },
      ],
      tool_choice: "auto",
    },
  };
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { value?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.value) return Response.json({ error: json?.error?.message ?? `OpenAI hatası (${res.status})` }, { status: 502 });
  await prisma.dmOnboardingSession.update({ where: { id: ob.id }, data: { status: "IN_CALL" } });
  return Response.json({ clientSecret: json.value, collected });
}
