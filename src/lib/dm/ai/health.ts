// AI sağlayıcı sağlığı: başarısız çağrıları kaydeder, ödeme / anahtar sorununu adminlere bildirir,
// "AI maliyeti" ekranı için sağlayıcı bazında durum çıkarır.
import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/inAppNotify";

export type AiFailureCode = "BILLING" | "KEY" | "RATE" | "OTHER";
export const AI_PROVIDERS = ["gemini", "anthropic", "openai"] as const;
export type RealProvider = (typeof AI_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<RealProvider, string> = { gemini: "Google Gemini", anthropic: "Anthropic (Claude)", openai: "OpenAI" };
/** Sağlayıcının ödeme / bakiye sayfası. */
export const PROVIDER_BILLING_URL: Record<RealProvider, string> = {
  gemini: "https://aistudio.google.com/usage",
  anthropic: "https://console.anthropic.com/settings/billing",
  openai: "https://platform.openai.com/settings/organization/billing/overview",
};

export const FAILURE_LABEL: Record<AiFailureCode, string> = {
  BILLING: "Ödeme / bakiye sorunu",
  KEY: "API anahtarı geçersiz",
  RATE: "Limit / yoğunluk",
  OTHER: "Diğer hata",
};

/** Sağlayıcı hata metninden sorunun türünü çıkarır. */
export function classifyAiError(message: string): AiFailureCode {
  const m = message.toLowerCase();
  if (/credit balance|insufficient_quota|exceeded your current quota|billing|payment|prepay|purchase credits|spend limit|spending limit|quota exceeded for quota metric/.test(m)) return "BILLING";
  if (/api key|api_key|x-api-key|authentication|unauthenticated|unauthorized|permission_denied|invalid_api_key|\(401\)|\(403\)|anahtarı girilmemiş/.test(m)) return "KEY";
  if (/\(429\)|rate limit|rate_limit|resource_exhausted|overloaded|\(529\)|too many requests|geçici hata/.test(m)) return "RATE";
  return "OTHER";
}

const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

/** Başarısız AI çağrısını kaydeder. Ödeme / anahtar sorununda adminlere (6 saatte bir) bildirim gönderir. Hata fırlatmaz. */
export async function recordAiFailure(p: { clientId: string | null; provider: string; model: string; kind: string; error: unknown }) {
  try {
    if (p.provider === "fake") return;
    const message = (p.error instanceof Error ? p.error.message : String(p.error)).slice(0, 1000);
    const code = classifyAiError(message);
    const recent =
      code === "BILLING" || code === "KEY"
        ? await prisma.dmAiFailure.findFirst({
            where: { provider: p.provider, code, createdAt: { gte: new Date(Date.now() - ALERT_EVERY_MS) } },
            select: { id: true },
          })
        : null;
    await prisma.dmAiFailure.create({ data: { clientId: p.clientId, provider: p.provider, model: p.model, kind: p.kind, code, message } });
    if ((code === "BILLING" || code === "KEY") && !recent) {
      const label = PROVIDER_LABEL[p.provider as RealProvider] ?? p.provider;
      const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true, isDeleted: false }, select: { id: true } });
      await Promise.all(
        admins.map((a) =>
          pushNotification({
            userId: a.id,
            type: "DM_AI_PROVIDER_ERROR",
            title: code === "BILLING" ? `${label}: ödeme alınamadı / bakiye bitti` : `${label}: API anahtarı çalışmıyor`,
            message:
              code === "BILLING"
                ? "AI cevap veremiyor, müşteri mesajları cevapsız kalabilir. Sağlayıcı hesabından ödemeyi / bakiyeyi kontrol edin."
                : "AI cevap veremiyor. Ayarlar → Mesaj Otomasyonu'ndan anahtarı kontrol edin.",
            url: "/mesaj-otomasyonu/ai-maliyet",
          }),
        ),
      );
    }
  } catch (e) {
    console.error("AI hata kaydı yazılamadı:", e instanceof Error ? e.message : e);
  }
}

export type ProviderHealth = {
  provider: RealProvider;
  label: string;
  billingUrl: string;
  hasKey: boolean;
  lastSuccessAt: Date | null;
  lastFailure: { code: AiFailureCode; message: string; createdAt: Date; model: string } | null;
  failures24h: number;
  /** ok: son çağrı başarılı · problem: son olay ödeme/anahtar hatası · warn: son 24 saatte hata var · idle: hiç kullanılmamış */
  status: "ok" | "problem" | "warn" | "idle";
};

export async function loadProviderHealth(keys: Record<RealProvider, boolean>): Promise<ProviderHealth[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return Promise.all(
    AI_PROVIDERS.map(async (provider) => {
      const [ok, fail, count] = await Promise.all([
        prisma.dmAiUsage.findFirst({ where: { provider }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.dmAiFailure.findFirst({ where: { provider }, orderBy: { createdAt: "desc" }, select: { code: true, message: true, createdAt: true, model: true } }),
        prisma.dmAiFailure.count({ where: { provider, createdAt: { gte: since } } }),
      ]);
      const lastFailure = fail ? { ...fail, code: fail.code as AiFailureCode } : null;
      const failedLast = !!lastFailure && (!ok || lastFailure.createdAt > ok.createdAt);
      const status: ProviderHealth["status"] =
        failedLast && (lastFailure!.code === "BILLING" || lastFailure!.code === "KEY")
          ? "problem"
          : failedLast || count > 0
            ? "warn"
            : ok
              ? "ok"
              : "idle";
      return {
        provider,
        label: PROVIDER_LABEL[provider],
        billingUrl: PROVIDER_BILLING_URL[provider],
        hasKey: keys[provider],
        lastSuccessAt: ok?.createdAt ?? null,
        lastFailure,
        failures24h: count,
        status,
      };
    }),
  );
}
