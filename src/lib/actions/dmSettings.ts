"use server";

// Ayarlar → Mesaj Otomasyonu (yalnızca admin): Meta DM token'ı, AI anahtarları, varsayılan modeller, bağlantı testleri.
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { checkDmPermissions, clearDmToken, getDmVerifyToken, storeDmApp, storeDmToken } from "@/lib/dm/metaDm";
import { setAiDefaults, setAiKey, type AiJob } from "@/lib/dm/ai/settings";
import { aiChat } from "@/lib/dm/ai";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
}

export async function saveDmMetaToken(token: string) {
  await requireAdmin();
  if (token.trim().length < 20) throw new Error("Token çok kısa görünüyor.");
  await storeDmToken(token);
  revalidatePath("/ayarlar");
  return checkDmPermissions();
}

export async function saveDmAppAction(appId: string, appSecret: string) {
  await requireAdmin();
  if (!/^\d{6,25}$/.test(appId.trim())) throw new Error("App ID yalnızca rakamlardan oluşmalı.");
  if (!/^[a-f0-9]{24,64}$/i.test(appSecret.trim())) throw new Error("App Secret geçersiz görünüyor.");
  await storeDmApp(appId, appSecret);
  revalidatePath("/ayarlar");
}

/** Meta webhook ayarına girilecek doğrulama anahtarı (yalnızca admin görür). */
export async function revealDmVerifyToken() {
  await requireAdmin();
  return getDmVerifyToken();
}

export async function removeDmMetaToken() {
  await requireAdmin();
  await clearDmToken();
  revalidatePath("/ayarlar");
}

export async function checkDmMetaAction() {
  await requireAdmin();
  return checkDmPermissions();
}

export async function saveAiKeyAction(provider: "gemini" | "anthropic" | "openai", key: string) {
  await requireAdmin();
  if (key.trim().length < 10) throw new Error("Anahtar çok kısa görünüyor.");
  await setAiKey(provider, key);
  revalidatePath("/ayarlar");
}

export async function removeAiKeyAction(provider: "gemini" | "anthropic" | "openai") {
  await requireAdmin();
  await setAiKey(provider, null);
  revalidatePath("/ayarlar");
}

export async function saveAiDefaultsAction(values: Partial<Record<AiJob, string>>) {
  await requireAdmin();
  const clean: Partial<Record<AiJob, string>> = {};
  for (const [k, v] of Object.entries(values)) {
    const s = (v ?? "").trim();
    if (s && !/^(gemini|anthropic|openai):[\w.\-]+$/.test(s)) throw new Error(`Geçersiz model: ${s} ("sağlayıcı:model" biçiminde olmalı)`);
    if (s) clean[k as AiJob] = s;
  }
  await setAiDefaults(clean);
  revalidatePath("/ayarlar");
}

/** Seçili modelle küçük bir deneme isteği (birkaç kuruşluk). */
export async function testAiModel(modelRef: string) {
  await requireAdmin();
  const r = await aiChat("text", modelRef, { system: "Kısa cevap ver.", turns: [{ role: "user", text: "Sadece 'Merhaba, çalışıyorum.' yaz." }], maxOutputTokens: 50 }, { clientId: null, kind: "TEST" });
  return { text: r.text, model: r.ref };
}
