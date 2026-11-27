import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Ofis Radyosu: çalışanlar YouTube linklerini sıraya ekler, ofisteki TV (Mi Stick tarayıcısında açık
// /radyo-tv/<token> sayfası) sırayla çalar. TV ile sunucu aynı ağda olmak zorunda değil: TV her birkaç
// saniyede bir durumu sunucudan çeker ve şarkı bitince/oynatılamayınca haber verir.

/** Bir kişinin aynı anda sırada bekleyebilecek en fazla şarkısı. */
export const RADIO_MAX_QUEUED_PER_USER = 3;
/** TV bu süre içinde durum sormadıysa "bağlı değil" sayılır. */
const TV_ONLINE_MS = 20_000;

const KEY_TOKEN = "radio_tv_token";
const KEY_PAUSED = "radio_paused";
const KEY_VOLUME = "radio_volume";
const KEY_SEEN = "radio_tv_seen";

async function getSetting(key: string) {
  return (await prisma.integrationSetting.findUnique({ where: { key } }))?.value ?? null;
}
async function setSetting(key: string, value: string) {
  await prisma.integrationSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export type RadioControls = { paused: boolean; volume: number; tvOnline: boolean; tvToken: string | null };

export async function getRadioControls(): Promise<RadioControls> {
  const rows = await prisma.integrationSetting.findMany({ where: { key: { in: [KEY_TOKEN, KEY_PAUSED, KEY_VOLUME, KEY_SEEN] } } });
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const seen = v[KEY_SEEN] ? Date.parse(v[KEY_SEEN]) : 0;
  const volume = Number(v[KEY_VOLUME]);
  return {
    paused: v[KEY_PAUSED] === "1",
    volume: Number.isFinite(volume) && v[KEY_VOLUME] !== undefined ? Math.min(100, Math.max(0, volume)) : 80,
    tvOnline: Date.now() - seen < TV_ONLINE_MS,
    tvToken: v[KEY_TOKEN] ?? null,
  };
}

export const setRadioPausedSetting = (paused: boolean) => setSetting(KEY_PAUSED, paused ? "1" : "0");
export const setRadioVolumeSetting = (volume: number) => setSetting(KEY_VOLUME, String(Math.round(Math.min(100, Math.max(0, volume)))));

/** Yeni TV bağlantısı üretir; eski bağlantı geçersiz olur. */
export async function regenerateRadioTvToken() {
  const token = crypto.randomBytes(24).toString("base64url");
  await setSetting(KEY_TOKEN, token);
  return token;
}

export async function verifyRadioTvToken(token: string) {
  const saved = await getSetting(KEY_TOKEN);
  if (!saved || !token) return false;
  const a = Buffer.from(saved);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** TV'nin son görülme zamanını günceller (veritabanına her istekte yazmamak için 10 sn'de bir). */
export async function markRadioTvSeen() {
  const seen = await getSetting(KEY_SEEN);
  if (seen && Date.now() - Date.parse(seen) < 10_000) return;
  await setSetting(KEY_SEEN, new Date().toISOString());
}

/** youtube.com/watch?v=, youtu.be/, shorts/, live/, embed/, music.youtube.com linklerinden video kimliğini çıkarır. */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v");
    if (!id) {
      const m = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})/);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export class RadioError extends Error {}

/** Videonun adını YouTube'dan alır. Gömülü oynatmaya kapalı / gizli / silinmiş videolarda hata verir. */
export async function fetchYouTubeInfo(videoId: string): Promise<{ title: string; channel: string | null }> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch {
    throw new RadioError("YouTube'a ulaşılamadı, biraz sonra tekrar deneyin.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new RadioError("Bu video başka sitelerde oynatılmaya izin vermiyor, TV'de açılamaz. Aynı şarkının başka bir yüklemesini deneyin.");
  }
  if (!res.ok) throw new RadioError("Video bulunamadı (gizli ya da silinmiş olabilir).");
  const data = (await res.json()) as { title?: string; author_name?: string };
  return { title: (data.title ?? "Bilinmeyen video").slice(0, 200), channel: data.author_name?.slice(0, 120) ?? null };
}

/** Çalan şarkıyı döndürür; yoksa sıradaki ilk şarkıyı çalmaya başlatır. */
export async function ensureRadioPlaying() {
  const playing = await prisma.radioTrack.findFirst({ where: { status: "PLAYING" }, orderBy: { startedAt: "asc" } });
  if (playing) return playing;
  const next = await prisma.radioTrack.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!next) return null;
  // Aynı anda iki istek gelirse sadece biri başlatır.
  const { count } = await prisma.radioTrack.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "PLAYING", startedAt: new Date() },
  });
  if (count === 0) return prisma.radioTrack.findFirst({ where: { status: "PLAYING" } });
  return { ...next, status: "PLAYING" as const, startedAt: new Date() };
}

/** Çalan şarkıyı bitirir (çalındı / geçildi / oynatılamadı) ve sıradakine geçer. */
export async function finishRadioTrack(trackId: string, status: "PLAYED" | "SKIPPED" | "FAILED") {
  const { count } = await prisma.radioTrack.updateMany({
    where: { id: trackId, status: "PLAYING" },
    data: { status, endedAt: new Date() },
  });
  if (count > 0) await ensureRadioPlaying();
  return count > 0;
}

/** TV ekranı ve panel için ortak durum. */
export async function getRadioQueue() {
  const current = await ensureRadioPlaying();
  const [queue, history] = await Promise.all([
    prisma.radioTrack.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } }),
    prisma.radioTrack.findMany({
      where: { status: { in: ["PLAYED", "SKIPPED", "FAILED"] } },
      orderBy: { endedAt: "desc" },
      take: 8,
    }),
  ]);
  const votes = current ? await prisma.radioSkipVote.findMany({ where: { trackId: current.id }, select: { userId: true } }) : [];
  return { current, queue, history, skipVoters: votes.map((v) => v.userId) };
}

/** 30 günden eski geçmiş kayıtlarını siler. */
export async function cleanupRadioHistory() {
  await prisma.radioTrack.deleteMany({
    where: { status: { in: ["PLAYED", "SKIPPED", "FAILED"] }, endedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
  });
}
