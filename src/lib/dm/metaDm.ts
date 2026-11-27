// Mesaj Otomasyonu için ayrı Meta uygulaması: System User token'ı (şifreli, IntegrationSetting "meta_dm_access_token"),
// sayfa token'ları, izin kontrolü ve sayfa aboneliği. Mevcut reklam/paylaşım token'ına (meta_access_token) dokunulmaz.
import type { DmChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const DM_GRAPH_VERSION = process.env.META_DM_GRAPH_VERSION ?? "v24.0";
const TOKEN_KEY = "meta_dm_access_token";
const GRAPH = `https://graph.facebook.com/${DM_GRAPH_VERSION}`;

/** Kurulumda doğrulanacak izinler (spesifikasyon bölüm 4). */
export const DM_REQUIRED_PERMISSIONS = [
  "pages_messaging",
  "pages_manage_metadata",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
];
/** Facebook sayfası için abone olunacak webhook alanları (Instagram echo'ları "messages" ile gelir). */
export const DM_PAGE_FIELDS = ["messages", "messaging_postbacks", "message_echoes", "messaging_referrals"];

export class MetaDmError extends Error {
  constructor(message: string, readonly code?: number, readonly subcode?: number, readonly status?: number) {
    super(message);
  }
  /** Geçici hata: tekrar denenebilir (hız sınırı, sunucu hatası). */
  get retryable() {
    return this.status === 429 || (this.status ?? 0) >= 500 || [4, 17, 32, 613, 80006].includes(this.code ?? -1);
  }
  /** 24 saat penceresi dışı ya da kişiye ulaşılamıyor: tekrar denemenin anlamı yok. */
  get windowClosed() {
    return this.code === 10 || this.subcode === 2018278 || this.code === 551 || this.subcode === 2534022;
  }
}

const APP_KEY = "meta_dm_app";
const VERIFY_KEY = "meta_dm_verify_token";

/** Mesaj uygulamasının App ID / App Secret bilgisi: Ayarlar'dan girilir (şifreli), yoksa .env (META_DM_APP_ID / _SECRET). */
let appCache: { at: number; value: { appId: string | null; appSecret: string | null } } | null = null;
export async function getDmApp(): Promise<{ appId: string | null; appSecret: string | null }> {
  if (appCache && Date.now() - appCache.at < 60_000) return appCache.value;
  const row = await prisma.integrationSetting.findUnique({ where: { key: APP_KEY } });
  const saved = row ? (JSON.parse(decryptSecret(row.value)) as { appId?: string; appSecret?: string }) : {};
  const value = { appId: saved.appId || process.env.META_DM_APP_ID || null, appSecret: saved.appSecret || process.env.META_DM_APP_SECRET || null };
  appCache = { at: Date.now(), value };
  return value;
}

export async function storeDmApp(appId: string, appSecret: string) {
  const value = encryptSecret(JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }));
  await prisma.integrationSetting.upsert({ where: { key: APP_KEY }, create: { key: APP_KEY, value }, update: { value } });
  appCache = null;
}

/** Webhook doğrulama anahtarı: .env (META_DM_VERIFY_TOKEN) ya da veritabanı; ikisi de yoksa üretilip saklanır. */
export async function getDmVerifyToken(): Promise<string> {
  if (process.env.META_DM_VERIFY_TOKEN) return process.env.META_DM_VERIFY_TOKEN;
  const row = await prisma.integrationSetting.findUnique({ where: { key: VERIFY_KEY } });
  if (row) return decryptSecret(row.value);
  const token = (await import("node:crypto")).randomBytes(24).toString("hex");
  await prisma.integrationSetting.upsert({ where: { key: VERIFY_KEY }, create: { key: VERIFY_KEY, value: encryptSecret(token) }, update: {} });
  return token;
}

export async function getDmToken(): Promise<string | null> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: TOKEN_KEY } });
  return row ? decryptSecret(row.value) : null;
}

export async function isDmMetaConnected() {
  return (await prisma.integrationSetting.count({ where: { key: TOKEN_KEY } })) > 0;
}

export async function storeDmToken(token: string) {
  const value = encryptSecret(token.trim());
  await prisma.integrationSetting.upsert({ where: { key: TOKEN_KEY }, create: { key: TOKEN_KEY, value }, update: { value } });
  pageTokens.clear();
}

export async function clearDmToken() {
  await prisma.integrationSetting.deleteMany({ where: { key: TOKEN_KEY } });
  pageTokens.clear();
}

async function graph<T>(path: string, init: { method?: string; params?: Record<string, string>; body?: unknown; token: string }): Promise<T> {
  const qs = new URLSearchParams({ ...(init.params ?? {}), access_token: init.token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, {
    method: init.method ?? "GET",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number; error_subcode?: number } } | null;
  if (!res.ok || json?.error) {
    throw new MetaDmError(json?.error?.message ?? `Meta isteği başarısız (${res.status}).`, json?.error?.code, json?.error?.error_subcode, res.status);
  }
  return json as T;
}

const pageTokens = new Map<string, { token: string; at: number }>();

/** Sayfa erişim anahtarı (System User token'ından; 1 saat önbellek). */
export async function getPageToken(pageId: string): Promise<string> {
  const cached = pageTokens.get(pageId);
  if (cached && Date.now() - cached.at < 3600_000) return cached.token;
  const token = await getDmToken();
  if (!token) throw new MetaDmError("Mesaj sistemi için Meta bağlantısı yapılmamış (Ayarlar).");
  const r = await graph<{ access_token?: string }>(pageId, { params: { fields: "access_token" }, token });
  if (!r.access_token) throw new MetaDmError("Sayfa erişim anahtarı alınamadı; System User'a bu sayfa için yetki verilmiş mi?");
  pageTokens.set(pageId, { token: r.access_token, at: Date.now() });
  return r.access_token;
}

/** Gelen olayın hesabından (Instagram hesap id'si ya da sayfa id'si) sayfa id'sini bulur. */
export async function pageIdForAccount(channel: DmChannel, accountId: string): Promise<string> {
  if (channel === "FACEBOOK") return accountId;
  const acc = await prisma.socialAccount.findFirst({ where: { igId: accountId }, select: { pageId: true } });
  if (!acc) throw new MetaDmError("Bu Instagram hesabına bağlı Facebook sayfası bulunamadı.");
  return acc.pageId;
}

export async function metaSend(input: { channel: DmChannel; accountId: string; recipientId: string; text?: string; imageUrl?: string }) {
  const pageId = await pageIdForAccount(input.channel, input.accountId);
  const token = await getPageToken(pageId);
  const message = input.imageUrl ? { attachment: { type: "image", payload: { url: input.imageUrl } } } : { text: input.text ?? "" };
  const body: Record<string, unknown> = { recipient: { id: input.recipientId }, message };
  if (input.channel === "FACEBOOK") body.messaging_type = "RESPONSE";
  const r = await graph<{ message_id?: string }>("me/messages", { method: "POST", body, token });
  return { externalId: r.message_id ?? null };
}

export async function metaSenderAction(input: { channel: DmChannel; accountId: string; recipientId: string; action: string }) {
  const pageId = await pageIdForAccount(input.channel, input.accountId);
  const token = await getPageToken(pageId);
  await graph("me/messages", { method: "POST", body: { recipient: { id: input.recipientId }, sender_action: input.action }, token });
}

/** Kişinin adı / kullanıcı adı / profil fotoğrafı (Business Asset User Profile Access). */
export async function metaContactProfile(input: { channel: DmChannel; accountId: string; contactId: string }) {
  const pageId = await pageIdForAccount(input.channel, input.accountId);
  const token = await getPageToken(pageId);
  if (input.channel === "INSTAGRAM") {
    const r = await graph<{ name?: string; username?: string; profile_pic?: string }>(input.contactId, { params: { fields: "name,username,profile_pic" }, token });
    return { name: r.name || null, username: r.username || null, profilePic: r.profile_pic || null };
  }
  const r = await graph<{ first_name?: string; last_name?: string; profile_pic?: string }>(input.contactId, { params: { fields: "first_name,last_name,profile_pic" }, token });
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ");
  return { name: name || null, username: null, profilePic: r.profile_pic || null };
}

/** Token'daki izinler (debug_token, uygulama anahtarıyla). Eksik izinleri döner. */
export async function checkDmPermissions(): Promise<{ ok: boolean; granted: string[]; missing: string[]; error?: string }> {
  const token = await getDmToken();
  if (!token) return { ok: false, granted: [], missing: DM_REQUIRED_PERMISSIONS, error: "Token girilmemiş." };
  const { appId, appSecret: secret } = await getDmApp();
  try {
    if (!appId || !secret) throw new MetaDmError("Mesaj uygulamasının App ID / App Secret bilgisi girilmemiş (Ayarlar).");
    const r = await graph<{ data?: { scopes?: string[]; is_valid?: boolean } }>("debug_token", {
      params: { input_token: token },
      token: `${appId}|${secret}`,
    });
    const granted = r.data?.scopes ?? [];
    const missing = DM_REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
    return { ok: !!r.data?.is_valid && missing.length === 0, granted, missing };
  } catch (e) {
    return { ok: false, granted: [], missing: DM_REQUIRED_PERMISSIONS, error: e instanceof Error ? e.message : "Kontrol edilemedi." };
  }
}

/** Sayfayı (ve bağlı Instagram hesabını) mesaj webhook'larına abone eder. */
export async function subscribePage(pageId: string) {
  const token = await getPageToken(pageId);
  await graph("" + pageId + "/subscribed_apps", { method: "POST", params: { subscribed_fields: DM_PAGE_FIELDS.join(",") }, token });
}

export async function pageSubscription(pageId: string): Promise<string[]> {
  const token = await getPageToken(pageId);
  const r = await graph<{ data?: { id: string; subscribed_fields?: string[] }[] }>(`${pageId}/subscribed_apps`, { token });
  const { appId } = await getDmApp();
  const mine = r.data?.find((a) => !appId || a.id === appId);
  return mine?.subscribed_fields ?? [];
}
