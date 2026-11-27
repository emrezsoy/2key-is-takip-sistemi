// AI anahtarları (Ayarlar ekranından girilir, veritabanında şifreli) ve varsayılan model seçimleri.
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { AiProviderName } from "./types";

const KEY_PREFIX = "ai_key_";
const DEFAULTS_KEY = "dm_ai_defaults";
const PRICES_KEY = "dm_ai_prices";

export type AiJob = "text" | "media" | "classify" | "setup" | "embedding";

/** Varsayılan modeller (Kasım 2026). Hepsi Ayarlar'dan ve müşteri bazında değiştirilebilir. */
export const BUILTIN_DEFAULTS: Record<AiJob, string> = {
  text: "gemini:gemini-3.6-flash",
  media: "gemini:gemini-3.6-flash",
  classify: "gemini:gemini-3.5-flash-lite",
  setup: "anthropic:claude-sonnet-5-5",
  embedding: "gemini:gemini-embedding-2",
};

/** Tahmini fiyatlar (USD / 1M token: giriş, çıkış). Claude fiyatları Anthropic'in listesinden; diğerleri tahmindir,
 * Ayarlar'dan güncellenebilir. Maliyet raporu bu tabloya göre hesaplanır. */
export const BUILTIN_PRICES: Record<string, [number, number]> = {
  "anthropic:claude-haiku-5-5": [0.1, 0.5],
  "anthropic:claude-sonnet-5-5": [2, 10],
  "anthropic:claude-opus-5-5": [4, 20],
  "gemini:gemini-3.6-flash": [0.3, 2.5],
  "gemini:gemini-3.5-flash-lite": [0.1, 0.4],
  "gemini:gemini-embedding-2": [0.15, 0],
  "openai:gpt-5-mini": [0.25, 2],
};

export async function getAiKey(provider: AiProviderName): Promise<string | null> {
  if (provider === "fake") return "fake";
  const row = await prisma.integrationSetting.findUnique({ where: { key: KEY_PREFIX + provider } });
  return row ? decryptSecret(row.value) : null;
}

export async function setAiKey(provider: Exclude<AiProviderName, "fake">, key: string | null) {
  const k = KEY_PREFIX + provider;
  if (!key) {
    await prisma.integrationSetting.deleteMany({ where: { key: k } });
    return;
  }
  const value = encryptSecret(key.trim());
  await prisma.integrationSetting.upsert({ where: { key: k }, create: { key: k, value }, update: { value } });
}

export async function aiKeyStatus(): Promise<Record<"gemini" | "anthropic" | "openai", boolean>> {
  const rows = await prisma.integrationSetting.findMany({ where: { key: { startsWith: KEY_PREFIX } }, select: { key: true } });
  const has = (p: string) => rows.some((r) => r.key === KEY_PREFIX + p);
  return { gemini: has("gemini"), anthropic: has("anthropic"), openai: has("openai") };
}

export async function getAiDefaults(): Promise<Record<AiJob, string>> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: DEFAULTS_KEY } });
  const saved = row ? (JSON.parse(row.value) as Partial<Record<AiJob, string>>) : {};
  return { ...BUILTIN_DEFAULTS, ...saved };
}

export async function setAiDefaults(values: Partial<Record<AiJob, string>>) {
  const current = await getAiDefaults();
  const value = JSON.stringify({ ...current, ...values });
  await prisma.integrationSetting.upsert({ where: { key: DEFAULTS_KEY }, create: { key: DEFAULTS_KEY, value }, update: { value } });
}

export async function getAiPrices(): Promise<Record<string, [number, number]>> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: PRICES_KEY } });
  return { ...BUILTIN_PRICES, ...(row ? (JSON.parse(row.value) as Record<string, [number, number]>) : {}) };
}

export async function setAiPrices(prices: Record<string, [number, number]>) {
  const value = JSON.stringify(prices);
  await prisma.integrationSetting.upsert({ where: { key: PRICES_KEY }, create: { key: PRICES_KEY, value }, update: { value } });
}

export function parseModelRef(ref: string): { provider: AiProviderName; model: string } {
  const i = ref.indexOf(":");
  const provider = (i > 0 ? ref.slice(0, i) : "gemini") as AiProviderName;
  const model = i > 0 ? ref.slice(i + 1) : ref;
  if (!["gemini", "anthropic", "openai", "fake"].includes(provider)) throw new Error(`Bilinmeyen AI sağlayıcısı: ${provider}`);
  return { provider, model };
}

export async function estimateCostUsd(modelRef: string, inputTokens: number, outputTokens: number): Promise<number> {
  const prices = await getAiPrices();
  const p = prices[modelRef];
  if (!p) return 0;
  return (inputTokens * p[0] + outputTokens * p[1]) / 1_000_000;
}
