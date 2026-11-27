// AI çağrılarının tek giriş noktası: model seçimi, anahtar, sağlayıcı, kullanım / maliyet kaydı (DmAiUsage).
import { prisma } from "@/lib/prisma";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { fakeProvider } from "./fake";
import { recordAiFailure } from "./health";
import { estimateCostUsd, getAiDefaults, getAiKey, getAiPrices, parseModelRef, type AiJob } from "./settings";
import { AiError, type AiChatInput, type AiChatResult, type AiMedia, type AiProvider, type AiProviderName } from "./types";

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
  fake: fakeProvider,
};

/** Kullanılacak model: müşteriye özel seçim → genel varsayılan. Anahtar yoksa ve geliştirme (sahte kanal) modundaysak
 * sahte sağlayıcıya düşer; canlıda anahtar yoksa hata verir (konuşma insana devredilir). */
export async function resolveModel(job: AiJob, clientChoice?: string | null): Promise<{ ref: string; provider: AiProviderName; model: string; apiKey: string }> {
  const defaults = await getAiDefaults();
  const ref = clientChoice || defaults[job];
  const { provider, model } = parseModelRef(ref);
  const apiKey = await getAiKey(provider);
  if (apiKey) return { ref, provider, model, apiKey };
  if ((process.env.DM_CHANNEL_MODE ?? "fake") !== "meta") return { ref: `fake:${model}`, provider: "fake", model, apiKey: "fake" };
  throw new AiError(`${provider} API anahtarı girilmemiş (Ayarlar → Mesaj Otomasyonu).`, false);
}

type ResolvedModel = Awaited<ReturnType<typeof resolveModel>>;

/** Sağlayıcı çağrısını sarar: başarısız olursa hatayı kaydeder (ödeme / anahtar sorununda adminlere bildirim) ve tekrar fırlatır. */
async function guarded<T>(job: AiJob, clientChoice: string | null | undefined, meta: { clientId: string | null; kind: string }, run: (m: ResolvedModel) => Promise<T>): Promise<T> {
  let m: ResolvedModel;
  try {
    m = await resolveModel(job, clientChoice);
  } catch (e) {
    const ref = clientChoice || (await getAiDefaults())[job];
    const i = ref.indexOf(":");
    await recordAiFailure({ clientId: meta.clientId, provider: i > 0 ? ref.slice(0, i) : "gemini", model: i > 0 ? ref.slice(i + 1) : ref, kind: meta.kind, error: e });
    throw e;
  }
  try {
    return await run(m);
  } catch (e) {
    await recordAiFailure({ clientId: meta.clientId, provider: m.provider, model: m.model, kind: meta.kind, error: e });
    throw e;
  }
}

async function logUsage(clientId: string | null, kind: string, ref: string, provider: string, model: string, usage: { inputTokens: number; outputTokens: number }, messageId?: string) {
  const costUsd = await estimateCostUsd(ref, usage.inputTokens, usage.outputTokens);
  await prisma.dmAiUsage.create({
    data: { clientId, kind, provider, model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd, messageId },
  });
  return costUsd;
}

export type AiCallMeta = { clientId: string | null; kind: "TEXT_REPLY" | "MEDIA" | "CLASSIFY" | "SUMMARY" | "ONBOARDING" | "EMBEDDING" | "TEST"; messageId?: string };

export async function aiChat(job: AiJob, clientChoice: string | null | undefined, input: Omit<AiChatInput, "model">, meta: AiCallMeta): Promise<AiChatResult & { ref: string; costUsd: number }> {
  return guarded(job, clientChoice, meta, async (m) => {
    const result = await PROVIDERS[m.provider].chat({ ...input, model: m.model }, m.apiKey);
    const costUsd = await logUsage(meta.clientId, meta.kind, m.ref, m.provider, m.model, result.usage, meta.messageId);
    return { ...result, ref: m.ref, costUsd };
  });
}

export async function aiDescribe(clientChoice: string | null | undefined, prompt: string, media: AiMedia, meta: AiCallMeta) {
  return guarded("media", clientChoice, meta, async (m) => {
    let provider = PROVIDERS[m.provider];
    // Video yalnızca Gemini'de doğrudan anlaşılır; başka sağlayıcı seçiliyse video analiz edilmez.
    if (media.mimeType.startsWith("video/") && m.provider !== "gemini" && m.provider !== "fake") {
      throw new AiError("Video analizi için medya modeli Gemini olmalı.", false);
    }
    if (!provider.describe) provider = PROVIDERS.gemini;
    const r = await provider.describe!({ model: m.model, prompt, media }, m.apiKey);
    await logUsage(meta.clientId, meta.kind, m.ref, m.provider, m.model, r.usage, meta.messageId);
    return { ...r, ref: m.ref };
  });
}

export async function aiEmbed(text: string, meta: AiCallMeta) {
  return guarded("embedding", null, { clientId: meta.clientId, kind: "EMBEDDING" }, async (m) => {
    const provider = PROVIDERS[m.provider];
    if (!provider.embed) throw new AiError(`${m.provider} embedding desteklemiyor.`, false);
    const r = await provider.embed({ model: m.model, text }, m.apiKey);
    await logUsage(meta.clientId, "EMBEDDING", m.ref, m.provider, m.model, r.usage);
    return { vector: r.vector, ref: m.ref };
  });
}

export { AiError } from "./types";

/** Sağlayıcı bağlantı testi (admin "Şimdi test et"): çok küçük bir çağrı yapar; ödeme / anahtar sorunu varsa hata döner.
 * Model: varsayılanlarda bu sağlayıcıya ait ilk model, yoksa fiyat tablosundaki en ucuz model. */
export async function aiPing(provider: "gemini" | "anthropic" | "openai"): Promise<{ ok: boolean; model: string; message: string }> {
  const defaults = await getAiDefaults();
  const fromDefaults = Object.entries(defaults).find(([job, ref]) => job !== "embedding" && ref.startsWith(`${provider}:`))?.[1];
  const prices = await getAiPrices();
  const cheapest = Object.entries(prices)
    .filter(([ref, p]) => ref.startsWith(`${provider}:`) && p[1] > 0)
    .sort((a, b) => a[1][0] + a[1][1] - (b[1][0] + b[1][1]))[0]?.[0];
  const ref = fromDefaults ?? cheapest;
  if (!ref) return { ok: false, model: "—", message: "Bu sağlayıcı için model bulunamadı." };
  const model = ref.slice(provider.length + 1);
  const apiKey = await getAiKey(provider);
  if (!apiKey) return { ok: false, model, message: "API anahtarı girilmemiş." };
  try {
    const r = await PROVIDERS[provider].chat({ model, system: "Sadece OK yaz.", turns: [{ role: "user", text: "test" }], maxOutputTokens: 64 }, apiKey);
    await logUsage(null, "TEST", ref, provider, model, r.usage);
    return { ok: true, model, message: "Çalışıyor." };
  } catch (e) {
    await recordAiFailure({ clientId: null, provider, model, kind: "TEST", error: e });
    return { ok: false, model, message: e instanceof Error ? e.message : String(e) };
  }
}
