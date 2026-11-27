"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { aiPing } from "@/lib/dm/ai";
import { getAiPrices, setAiPrices, BUILTIN_PRICES } from "@/lib/dm/ai/settings";
import { setAiBalance, setUsdTry } from "@/lib/dm/aiCost";
import { AI_PROVIDERS, type RealProvider } from "@/lib/dm/ai/health";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  if (session.user.role !== "ADMIN") throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
}

const PAGE = "/mesaj-otomasyonu/ai-maliyet";
const isProvider = (p: string): p is RealProvider => (AI_PROVIDERS as readonly string[]).includes(p);

/** Sağlayıcıyı küçük bir çağrıyla dener (ödeme / anahtar kontrolü). */
export async function testAiProvider(provider: string) {
  await requireAdmin();
  if (!isProvider(provider)) return { ok: false, model: "—", message: "Bilinmeyen sağlayıcı." };
  const r = await aiPing(provider);
  revalidatePath(PAGE);
  revalidatePath("/mesaj-otomasyonu");
  return r;
}

/** Model fiyatı (USD / 1M token). Boş bırakılırsa yerleşik fiyata döner. */
export async function saveAiPrice(input: { ref: string; inputUsd: number | null; outputUsd: number | null }) {
  await requireAdmin();
  const ref = input.ref.trim();
  if (!/^(gemini|anthropic|openai):[\w.\-]+$/.test(ref)) return { ok: false, message: "Model 'sağlayıcı:model' biçiminde olmalı." };
  const current = await getAiPrices();
  const custom: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(current)) {
    const b = BUILTIN_PRICES[k];
    if (!b || b[0] !== v[0] || b[1] !== v[1]) custom[k] = v;
  }
  if (input.inputUsd == null && input.outputUsd == null) delete custom[ref];
  else {
    const a = Number(input.inputUsd ?? 0);
    const b = Number(input.outputUsd ?? 0);
    if (!(a >= 0 && b >= 0 && a < 1000 && b < 1000)) return { ok: false, message: "Fiyat 0 ile 1000 arasında olmalı." };
    custom[ref] = [a, b];
  }
  await setAiPrices(custom);
  revalidatePath(PAGE);
  return { ok: true, message: "Fiyat kaydedildi. Yeni çağrılar bu fiyatla hesaplanır." };
}

/** Sağlayıcıya yüklenen bakiye (tahmini kalanı hesaplamak için). amountUsd boşsa takip kapanır. */
export async function saveAiBalance(input: { provider: string; amountUsd: number | null; since: string }) {
  await requireAdmin();
  if (!isProvider(input.provider)) return { ok: false, message: "Bilinmeyen sağlayıcı." };
  if (input.amountUsd == null) await setAiBalance(input.provider, null);
  else {
    if (!(input.amountUsd > 0 && input.amountUsd < 1_000_000)) return { ok: false, message: "Tutar geçersiz." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.since)) return { ok: false, message: "Tarih geçersiz." };
    await setAiBalance(input.provider, { amountUsd: input.amountUsd, since: input.since });
  }
  revalidatePath(PAGE);
  revalidatePath("/mesaj-otomasyonu");
  return { ok: true, message: "Kaydedildi." };
}

export async function saveUsdTry(rate: number | null) {
  await requireAdmin();
  if (rate != null && !(rate > 0 && rate < 10_000)) return { ok: false, message: "Kur geçersiz." };
  await setUsdTry(rate);
  revalidatePath(PAGE);
  return { ok: true, message: "Kaydedildi." };
}
