import { prisma } from "@/lib/prisma";
import { getMetaToken } from "@/lib/meta";
import { downloadFromDrive, getDriveConfig } from "@/lib/drive";
import { fileIdFromUrl, publicMediaUrl } from "@/lib/publicMedia";
import { syncAccountCampaigns } from "@/lib/adsSync";
import {
  CONVERSION_EVENTS,
  MESSAGE_DESTINATIONS,
  OBJECTIVES,
  PLACEMENTS,
  placementId,
  supportsVariants,
  type AdDraft,
  type AudienceDraft,
  type CampaignDetail,
  type CampaignDraft,
  type ComposerContext,
  type CopySpec,
  type ExistingPost,
  type LocationPick,
  type MessageDestination,
  type ObjectiveKey,
  type SpecialCategory,
  type TargetItem,
  type UploadedMedia,
} from "@/lib/adsTypes";

// Meta reklam yönetimi (Marketing API). Kampanyalar her zaman DURAKLATILMIŞ kurulur; para harcatan adım ayrıca
// "Yayına al" ile yapılır. Bir adım hata verirse yarım kalan kampanya silinir.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const G = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class AdsError extends Error {}

type GraphError = { message?: string; error_user_title?: string; error_user_msg?: string };

/** Meta hatasını kullanıcıya gösterilecek metne çevirir (Meta çoğu zaman kendi Türkçe açıklamasını verir). */
function errorText(e: GraphError | undefined, fallback: string) {
  if (!e) return fallback;
  if (e.error_user_msg) return e.error_user_title ? `${e.error_user_title}: ${e.error_user_msg}` : e.error_user_msg;
  return e.message ?? fallback;
}

async function token() {
  const t = await getMetaToken();
  if (!t) throw new AdsError("Meta bağlantısı yok (Reklam Paneli > Meta bağlantısı).");
  return t;
}

async function gGet<T>(path: string, params: Record<string, string>, t: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: t });
  const res = await fetch(`${G}/${path}?${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new AdsError(errorText(json?.error, `Meta isteği başarısız (${res.status}).`));
  return json as T;
}

async function gPost<T>(path: string, body: Record<string, unknown>, t: string): Promise<T> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  form.set("access_token", t);
  const res = await fetch(`${G}/${path}`, { method: "POST", body: form, cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new AdsError(errorText(json?.error, `Meta isteği başarısız (${res.status}).`));
  return json as T;
}

async function gDelete(path: string, t: string) {
  const res = await fetch(`${G}/${path}?access_token=${encodeURIComponent(t)}`, { method: "DELETE" });
  const json = await res.json().catch(() => null);
  if (json?.error) throw new AdsError(errorText(json.error, "Silinemedi."));
}

const act = (accountMetaId: string) => `act_${accountMetaId.replace(/^act_/, "")}`;
const toMinor = (tl: number) => Math.round(tl * 100);
const positive = (v?: string | number | null) => Number(v ?? 0) > 0;
const LIVE = (s: string) => s !== "DELETED" && s !== "ARCHIVED";
const isoOrUndef = (v: string | null | undefined) => (v ? new Date(v).toISOString() : undefined);

// ---- Sayfa / Instagram ----------------------------------------------------------------

type Identity = { pageId: string; pageName: string; igId: string | null; igUsername: string | null };

async function socialFor(clientId: string | null) {
  if (!clientId) throw new AdsError("Reklam hesabı bir müşteriye bağlı değil (Reklam Paneli > hesap eşleştirme).");
  const social = await prisma.socialAccount.findFirst({ where: { clientId }, orderBy: { createdAt: "asc" } });
  if (!social) throw new AdsError("Bu müşterinin Facebook sayfası sisteme bağlı değil (Sosyal Medya).");
  return social;
}

/** Reklamın yayınlanacağı Facebook sayfası ve Instagram hesabı: hesabın bağlı olduğu müşterinin sosyal hesabı. */
async function identityFor(clientId: string | null, t: string): Promise<Identity> {
  const social = await socialFor(clientId);
  const pages = await gGet<{ data: { id: string; tasks?: string[] }[] }>("me/accounts", { fields: "id,tasks", limit: "200" }, t);
  const tasks = pages.data.find((p) => p.id === social.pageId)?.tasks ?? [];
  if (!tasks.includes("ADVERTISE") && !tasks.includes("MANAGE")) {
    throw new AdsError(`"${social.pageName}" sayfasında reklam verme yetkisi yok (Meta'da sayfada sistem kullanıcısına "Reklamlar" görevi verilmeli).`);
  }
  return { pageId: social.pageId, pageName: social.pageName, igId: social.igId, igUsername: social.igUsername };
}

async function pageToken(pageId: string, t: string) {
  const r = await gGet<{ access_token?: string }>(pageId, { fields: "access_token" }, t);
  if (!r.access_token) throw new AdsError("Sayfa erişim anahtarı alınamadı.");
  return r.access_token;
}

// ---- Medya ------------------------------------------------------------------------------

export type MediaInput = { kind: "stored"; url: string } | { kind: "upload"; name: string; type: string; bytes: Buffer };

async function uploadImage(accountMetaId: string, bytes: Buffer, t: string): Promise<{ hash: string; url: string }> {
  const res = await gPost<{ images: Record<string, { hash: string; url?: string }> }>(
    `${act(accountMetaId)}/adimages`,
    { bytes: bytes.toString("base64") },
    t
  );
  const first = Object.values(res.images ?? {})[0];
  if (!first?.hash) throw new AdsError("Görsel Meta'ya yüklenemedi.");
  return { hash: first.hash, url: first.url ?? "" };
}

/** Video işlenene kadar bekler ve Meta'nın önerdiği kapak karesini döndürür. */
async function waitVideo(videoId: string, t: string, maxMs = 180_000): Promise<string> {
  const until = Date.now() + maxMs;
  for (;;) {
    const v = await gGet<{
      status?: { video_status?: string };
      thumbnails?: { data: { uri: string; is_preferred?: boolean }[] };
    }>(videoId, { fields: "status,thumbnails{uri,is_preferred}" }, t);
    const st = v.status?.video_status;
    if (st === "error") throw new AdsError("Meta videoyu işleyemedi (biçim / boyut uygun olmayabilir).");
    const thumbs = v.thumbnails?.data ?? [];
    if (st === "ready" && thumbs.length > 0) return (thumbs.find((x) => x.is_preferred) ?? thumbs[0]).uri;
    if (Date.now() > until) throw new AdsError("Video Meta'da hâlâ işleniyor. Birkaç dakika sonra aynı videoyla tekrar deneyin.");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Görseli / videoyu reklam hesabına yükler (kampanya kurmadan önce; önizleme ve kurulumda bu kimlik kullanılır). */
export async function uploadMedia(accountMetaId: string, media: MediaInput): Promise<UploadedMedia> {
  const t = await token();
  if (media.kind === "upload") {
    if (media.type.startsWith("image/")) {
      const img = await uploadImage(accountMetaId, media.bytes, t);
      return { type: "image", hash: img.hash, preview: img.url };
    }
    if (!media.type.startsWith("video/")) throw new AdsError("Sadece görsel ya da video yüklenebilir.");
    const form = new FormData();
    form.set("access_token", t);
    form.set("name", media.name);
    form.set("source", new Blob([new Uint8Array(media.bytes)], { type: media.type }), media.name);
    const res = await fetch(`${G}/${act(accountMetaId)}/advideos`, { method: "POST", body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.error || !json?.id) throw new AdsError(errorText(json?.error, "Video Meta'ya yüklenemedi."));
    const thumb = await waitVideo(json.id, t);
    return { type: "video", videoId: json.id, thumbUrl: thumb, preview: thumb };
  }

  const fileId = fileIdFromUrl(media.url);
  const file = fileId ? await prisma.storedFile.findUnique({ where: { id: fileId } }) : null;
  if (!file) throw new AdsError("Seçilen dosya bulunamadı.");
  if (file.mimeType.startsWith("video/")) {
    // Meta videoyu imzalı geçici bağlantıdan kendisi indirir.
    const res = await gPost<{ id: string }>(
      `${act(accountMetaId)}/advideos`,
      { file_url: publicMediaUrl(file.id, "o", file.name), name: file.name },
      t
    );
    const thumb = await waitVideo(res.id, t);
    return { type: "video", videoId: res.id, thumbUrl: thumb, preview: thumb };
  }
  const config = await getDriveConfig();
  if (!config) throw new AdsError("Google Drive bağlantısı yok.");
  const upstream = await downloadFromDrive(config, file.driveFileId);
  if (!upstream.ok) throw new AdsError("Görsel Drive'dan alınamadı.");
  const img = await uploadImage(accountMetaId, Buffer.from(await upstream.arrayBuffer()), t);
  return { type: "image", hash: img.hash, preview: img.url || media.url };
}

// ---- Hedef kitle ------------------------------------------------------------------------

const GEO_KEYS = ["countries", "regions", "cities", "medium_geo_areas", "neighborhoods"] as const;
const GEO_TYPE_KEY: Record<LocationPick["type"], (typeof GEO_KEYS)[number]> = {
  country: "countries",
  region: "regions",
  city: "cities",
  medium_geo_area: "medium_geo_areas",
  neighborhood: "neighborhoods",
};
const MANAGED_TARGETING = [
  "age_min",
  "age_max",
  "age_range",
  "genders",
  "locales",
  "flexible_spec",
  "exclusions",
  "custom_audiences",
  "excluded_custom_audiences",
  "publisher_platforms",
  "facebook_positions",
  "instagram_positions",
  "messenger_positions",
  "audience_network_positions",
  "targeting_automation",
  "targeting_optimization",
];

function geoFrom(locs: LocationPick[], withRadius: boolean, base: Record<string, unknown> = {}) {
  const geo: Record<string, unknown> = { ...base };
  for (const k of GEO_KEYS) delete geo[k];
  for (const l of locs) {
    const key = GEO_TYPE_KEY[l.type];
    const list = (geo[key] as unknown[] | undefined) ?? [];
    if (l.type === "country") list.push(l.key);
    else if (l.type === "city" && withRadius) list.push({ key: l.key, radius: Math.min(Math.max(l.radius ?? 25, 17), 80), distance_unit: "kilometer" });
    else list.push({ key: l.key });
    geo[key] = list;
  }
  return geo;
}

/** Arayüzdeki hedef kitleyi Meta targeting nesnesine çevirir. `base` verilirse (düzenleme) arayüzün yönetmediği
 * ayarlar (harita iğneleri, posta kodları ...) korunur. */
export function buildTargeting(a: AudienceDraft, special: SpecialCategory, base?: Record<string, unknown>) {
  const t: Record<string, unknown> = { ...(base ?? {}) };
  for (const k of MANAGED_TARGETING) delete t[k];

  const geo = geoFrom(a.locations, true, (base?.geo_locations as Record<string, unknown>) ?? {});
  geo.location_types = a.locationMode === "home" ? ["home"] : ["home", "recent"];
  const hasGeo = GEO_KEYS.some((k) => Array.isArray(geo[k]) && (geo[k] as unknown[]).length > 0) ||
    ["custom_locations", "places", "zips", "subcities", "geo_markets", "electoral_districts"].some((k) => Array.isArray(geo[k]) && (geo[k] as unknown[]).length > 0);
  if (!hasGeo) geo.countries = ["TR"];
  t.geo_locations = geo;

  const exGeo = geoFrom(a.excludedLocations, false, (base?.excluded_geo_locations as Record<string, unknown>) ?? {});
  if (Object.keys(exGeo).some((k) => Array.isArray(exGeo[k]) && (exGeo[k] as unknown[]).length > 0)) t.excluded_geo_locations = exGeo;
  else delete t.excluded_geo_locations;

  t.targeting_automation = { advantage_audience: a.advantage && !special ? 1 : 0 };
  if (special) {
    // Özel kategoride (konut / istihdam / finans / siyaset) yaş ve cinsiyet daraltılamaz.
    t.age_min = 18;
    t.age_max = 65;
  } else if (a.advantage) {
    // Advantage+ kitlede yaş sınırı kesin değil öneridir: kesin alt sınır en çok 25, üst sınır 65.
    t.age_min = Math.min(a.ageMin, 25);
    t.age_max = 65;
    if (a.ageMin !== t.age_min || a.ageMax !== 65) t.age_range = [a.ageMin, a.ageMax];
    if (a.gender !== "all") t.genders = [a.gender === "male" ? 1 : 2];
  } else {
    t.age_min = a.ageMin;
    t.age_max = a.ageMax;
    if (a.gender !== "all") t.genders = [a.gender === "male" ? 1 : 2];
  }
  if (a.locales.length) t.locales = a.locales.map((l) => l.key);
  if (a.detailed.length && !special) {
    const group: Record<string, { id: string; name: string }[]> = {};
    for (const d of a.detailed) (group[d.type] ??= []).push({ id: d.id, name: d.name });
    t.flexible_spec = [group];
  }
  if (a.customAudiences.length) t.custom_audiences = a.customAudiences.map((c) => ({ id: c.id }));
  if (a.excludedAudiences.length) t.excluded_custom_audiences = a.excludedAudiences.map((c) => ({ id: c.id }));

  if (a.placements.mode === "manual") {
    const chosen = PLACEMENTS.filter((p) => a.placements.ids.includes(placementId(p)));
    if (chosen.length === 0) throw new AdsError("Elle yerleşimde en az bir yerleşim seçin.");
    const platforms = [...new Set(chosen.map((p) => p.platform))];
    t.publisher_platforms = platforms;
    for (const pl of platforms) {
      const key = pl === "audience_network" ? "audience_network_positions" : `${pl}_positions`;
      t[key] = chosen.filter((p) => p.platform === pl).map((p) => p.key);
    }
  }
  return t;
}

const LOCALE_NAMES: Record<number, string> = { 19: "Türkçe", 6: "İngilizce (ABD)", 24: "İngilizce (İngiltere)", 1001: "İngilizce (tümü)", 5: "Almanca", 1002: "İspanyolca (tümü)", 28: "Arapça", 22: "Rusça", 9: "Fransızca" };

/** Meta targeting nesnesini düzenleme ekranına çevirir (bilinmeyen ayarlar korunur). */
export function targetingToDraft(t: Record<string, unknown>): AudienceDraft {
  const geo = (t.geo_locations ?? {}) as Record<string, { key?: string; name?: string; radius?: number; region?: string }[] | string[]>;
  const locs = (g: typeof geo, withRadius: boolean): LocationPick[] => {
    const out: LocationPick[] = [];
    for (const c of (g.countries as string[] | undefined) ?? []) out.push({ key: c, type: "country", name: c === "TR" ? "Türkiye" : c });
    for (const [k, type] of [
      ["regions", "region"],
      ["cities", "city"],
      ["medium_geo_areas", "medium_geo_area"],
      ["neighborhoods", "neighborhood"],
    ] as const) {
      for (const x of ((g[k] as { key: string; name?: string; radius?: number; region?: string }[] | undefined) ?? [])) {
        const name = x.name ? (x.region && type !== "region" ? `${x.name} (${x.region.replace(/ Province$/, "")})` : x.name) : x.key;
        out.push({ key: x.key, type, name, ...(type === "city" && withRadius ? { radius: x.radius ?? 25 } : {}) });
      }
    }
    return out;
  };
  const flex = ((t.flexible_spec as Record<string, { id: string; name?: string }[]>[] | undefined) ?? [])[0] ?? {};
  const detailed: TargetItem[] = Object.entries(flex).flatMap(([type, items]) =>
    Array.isArray(items) ? items.map((i) => ({ id: i.id, name: i.name ?? i.id, type })) : []
  );
  const auto = (t.targeting_automation as { advantage_audience?: number } | undefined)?.advantage_audience === 1;
  const range = Array.isArray(t.age_range) ? (t.age_range as number[]) : null;
  const genders = (t.genders as number[] | undefined) ?? [];
  const platforms = (t.publisher_platforms as string[] | undefined) ?? [];
  const ids: string[] = [];
  for (const pl of platforms) {
    const key = pl === "audience_network" ? "audience_network_positions" : `${pl}_positions`;
    for (const pos of (t[key] as string[] | undefined) ?? []) ids.push(`${pl}:${pos}`);
  }
  const extra = ["custom_locations", "places", "zips", "subcities", "geo_markets"].reduce(
    (n, k) => n + (Array.isArray((geo as Record<string, unknown[]>)[k]) ? (geo as Record<string, unknown[]>)[k].length : 0),
    0
  );
  const moreGroups = ((t.flexible_spec as unknown[] | undefined) ?? []).length > 1;
  return {
    locations: locs(geo, true),
    excludedLocations: locs((t.excluded_geo_locations ?? {}) as typeof geo, false),
    locationMode: ((geo as unknown as { location_types?: string[] }).location_types ?? ["home", "recent"]).length === 1 ? "home" : "all",
    ageMin: range ? range[0] : Number(t.age_min ?? 18),
    ageMax: range ? range[1] : Number(t.age_max ?? 65),
    gender: genders.length === 1 ? (genders[0] === 1 ? "male" : "female") : "all",
    detailed,
    customAudiences: ((t.custom_audiences as { id: string; name?: string }[] | undefined) ?? []).map((c) => ({ id: c.id, name: c.name ?? c.id })),
    excludedAudiences: ((t.excluded_custom_audiences as { id: string; name?: string }[] | undefined) ?? []).map((c) => ({ id: c.id, name: c.name ?? c.id })),
    locales: ((t.locales as number[] | undefined) ?? []).map((k) => ({ key: k, name: LOCALE_NAMES[k] ?? `Dil #${k}` })),
    advantage: auto,
    placements: platforms.length ? { mode: "manual", ids } : { mode: "auto", ids: [] },
    preservedNote:
      [extra ? `Haritadan / posta koduyla seçilmiş ${extra} konum korunur.` : "", moreGroups ? "Birden fazla \"VE\" grubu olan detaylı hedeflemenin sadece ilk grubu düzenlenebilir." : ""]
        .filter(Boolean)
        .join(" ") || null,
  };
}

// ---- Kreatif ----------------------------------------------------------------------------

/** Meta'nın otomatik kreatif iyileştirmeleri kapalıyken tek tek kapatılan özellikler (Meta'da doğrulandı). */
const ENHANCEMENTS_OPT_OUT = [
  "image_touchups", "image_brightness_and_contrast", "enhance_cta", "text_optimizations", "image_animation", "image_uncrop",
  "image_templates", "adapt_to_placement", "add_text_overlay", "video_auto_crop", "image_enhancement", "description_automation",
  "inline_comment", "video_highlight", "show_summary", "show_destination_blurbs", "text_translation", "site_extensions",
  "profile_card", "music_generation", "audio", "creative_stickers", "media_type_automation", "multi_photo_to_video",
  "replace_media_text", "text_generation", "image_background_gen",
];

type CreativeCtx = { objective: ObjectiveKey; destination: MessageDestination; id: Identity };

function igUrl(id: Identity) {
  if (!id.igUsername) throw new AdsError("Bu müşterinin Instagram hesabı bağlı değil.");
  return `https://www.instagram.com/${id.igUsername}`;
}
const httpOk = (v: string) => /^https?:\/\/\S+\.\S+/i.test(v.trim());

/** Amaca göre reklamın butonu ve ana bağlantısı. */
function ctaFor(ctx: CreativeCtx, ad: AdDraft): { link: string | null; cta: { type: string; value: Record<string, unknown> } | null } {
  const { objective, destination, id } = ctx;
  switch (objective) {
    case "MESSAGES": {
      const d = MESSAGE_DESTINATIONS[destination];
      if (d.instagram && !id.igId) throw new AdsError("Instagram mesaj hedefi için müşterinin Instagram hesabı bağlı olmalı.");
      if (destination === "IG") return { link: "https://www.instagram.com/", cta: { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT" } } };
      if (d.whatsapp) return { link: "https://api.whatsapp.com/send", cta: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } } };
      return { link: "https://www.facebook.com/", cta: { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } } };
    }
    case "PROFILE": {
      const url = igUrl(id);
      return { link: url, cta: { type: "VIEW_INSTAGRAM_PROFILE", value: { link: url } } };
    }
    case "TRAFFIC":
    case "LANDING":
    case "CONVERSIONS":
      if (!httpOk(ad.link)) throw new AdsError(`"${ad.name}": web sitesi bağlantısı http(s):// ile başlamalı.`);
      return { link: ad.link.trim(), cta: { type: ad.cta || "LEARN_MORE", value: { link: ad.link.trim() } } };
    case "LEADS_FORM":
      if (!ad.leadFormId) throw new AdsError(`"${ad.name}": bir anlık form seçin.`);
      return { link: "http://fb.me/", cta: { type: ad.cta || "SIGN_UP", value: { lead_gen_form_id: ad.leadFormId } } };
    case "PAGE_LIKES":
      return { link: `https://www.facebook.com/${id.pageId}`, cta: { type: "LIKE_PAGE", value: { page: id.pageId } } };
    default:
      if (!ad.link.trim()) return { link: null, cta: null };
      if (!httpOk(ad.link)) throw new AdsError(`"${ad.name}": bağlantı http(s):// ile başlamalı.`);
      return { link: ad.link.trim(), cta: { type: ad.cta || "LEARN_MORE", value: { link: ad.link.trim() } } };
  }
}

/** Birden çok mesaj hedefinde (Instagram + Messenger, + WhatsApp ...) Meta her hedef için ayrı buton ve
 * "DOF_MESSAGING_DESTINATION" optimizasyonu ister (Meta'da çalışan kampanyadan alındı). Tek hedefte boş döner. */
function messagingDestinations(ctx: CreativeCtx): Record<string, unknown> {
  if (ctx.objective !== "MESSAGES") return {};
  const d = ctx.destination;
  if (d === "IG" || d === "MESSENGER" || d === "WHATSAPP") return {};
  const ig = { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT", link: "https://www.instagram.com/" } };
  const ms = { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER", link: "https://www.facebook.com/" } };
  const wa = { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP", link: "https://api.whatsapp.com/send" } };
  const list = d === "IG_MESSENGER" ? [ig, ms] : d === "IG_WHATSAPP" ? [ig, wa] : d === "MESSENGER_WHATSAPP" ? [ms, wa] : [ig, ms, wa];
  return { asset_feed_spec: { call_to_actions: list, optimization_type: "DOF_MESSAGING_DESTINATION" } };
}

function welcomeMessage(ad: AdDraft) {
  const text = ad.welcomeText.trim();
  const answers = ad.welcomeAnswers ?? [];
  const qs = ad.welcomeQuestions
    .map((q, i) => ({ title: q.trim(), response: (answers[i] ?? "").trim() || null }))
    .filter((q) => q.title)
    .slice(0, 4);
  if (!text && qs.length === 0) return undefined;
  // Meta sınırı: karşılama metni ve her otomatik cevap en fazla 300 karakter.
  if (text.length > 300) throw new AdsError(`"${ad.name}": karşılama mesajı en fazla 300 karakter olabilir (şu an ${text.length}).`);
  const long = qs.find((q) => (q.response?.length ?? 0) > 300);
  if (long) throw new AdsError(`"${ad.name}": "${long.title}" sorusunun otomatik cevabı en fazla 300 karakter olabilir (şu an ${long.response!.length}).`);
  if (qs.length === 0) return text;
  return JSON.stringify({
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: {
      customer_action_type: "ice_breakers",
      message: { ice_breakers: qs, quick_replies: [], text: text || "Merhaba! Size nasıl yardımcı olabiliriz?" },
    },
  });
}

function mediaPart(m: UploadedMedia) {
  return m.type === "image" ? { image_hash: m.hash } : { video_id: m.videoId, picture: m.thumbUrl };
}

/** Taslaktaki reklamı Meta kreatif nesnesine çevirir. */
export function buildCreative(ctx: CreativeCtx, ad: AdDraft): Record<string, unknown> {
  const { id } = ctx;
  const texts = ad.texts.map((s) => s.trim()).filter(Boolean);
  const heads = ad.headlines.map((s) => s.trim()).filter(Boolean);
  const extras: Record<string, unknown> = {};
  if (ad.utm.trim()) extras.url_tags = ad.utm.trim().replace(/^\?/, "");
  const optOut = ad.enhancements
    ? {}
    : { degrees_of_freedom_spec: { creative_features_spec: Object.fromEntries(ENHANCEMENTS_OPT_OUT.map((k) => [k, { enroll_status: "OPT_OUT" }])) } };

  if (ad.format === "existing") {
    const p = ad.existing;
    if (!p) throw new AdsError(`"${ad.name}": öne çıkarılacak gönderiyi seçin.`);
    // Birden çok mesaj hedefinde (ör. Instagram + Messenger) Meta her kreatifte bu ayarı (degrees_of_freedom_spec) şart koşuyor.
    if (p.kind === "fb") return { object_story_id: p.id, ...(id.igId ? { instagram_user_id: id.igId } : {}), ...extras, ...optOut, ...messagingDestinations(ctx) };
    if (!id.igId) throw new AdsError("Instagram gönderisi için müşterinin Instagram hesabı bağlı olmalı.");
    const { link, cta } = ctaFor(ctx, ad);
    // Mesaj amacında karşılama mesajı / hazır sorular Instagram gönderisi reklamında da kullanılabilir (Meta'da doğrulandı).
    const igWelcome = ctx.objective === "MESSAGES" ? welcomeMessage(ad) : undefined;
    return {
      ...(igWelcome ? { page_welcome_message: igWelcome } : {}),
      source_instagram_media_id: p.id,
      instagram_user_id: id.igId,
      ...(cta ? { call_to_action: { ...cta, value: { ...cta.value, ...(link && !cta.value.link && !cta.value.lead_gen_form_id ? { link } : {}) } } } : {}),
      ...extras,
      ...optOut,
      ...messagingDestinations(ctx),
    };
  }

  if (texts.length === 0) throw new AdsError(`"${ad.name}": reklam metni boş olamaz.`);
  if (!supportsVariants(ctx.objective)) {
    const label = OBJECTIVES[ctx.objective].label;
    if (ad.format === "single" && ad.storyMedia) throw new AdsError(`"${ad.name}": ${label} amacında hikayeye özel medya kullanılamıyor (Meta kısıtı); hikaye medyasını kaldırın.`);
    if (texts.length > 1 || heads.length > 1) throw new AdsError(`"${ad.name}": ${label} amacında birden çok metin / başlık seçeneği kullanılamıyor (Meta kısıtı); tek metin bırakın.`);
  }
  const { link, cta } = ctaFor(ctx, ad);
  const welcome = ctx.objective === "MESSAGES" ? welcomeMessage(ad) : undefined;
  const base: Record<string, unknown> = { page_id: id.pageId, ...(id.igId ? { instagram_user_id: id.igId } : {}) };

  if (ad.format === "carousel") {
    const cards = ad.cards.filter((c) => c.media);
    if (cards.length < 2) throw new AdsError(`"${ad.name}": kaydırmalı reklamda en az 2 kart (görsel / video) olmalı.`);
    if (cards.length > 10) throw new AdsError(`"${ad.name}": kaydırmalı reklamda en fazla 10 kart olabilir.`);
    const main = link ?? `https://www.facebook.com/${id.pageId}`;
    const linkData: Record<string, unknown> = {
      link: main,
      message: texts[0],
      multi_share_optimized: true,
      multi_share_end_card: false,
      child_attachments: cards.map((c) => {
        const cardLink = c.link.trim() && ["TRAFFIC", "LANDING", "CONVERSIONS", "REACH", "VIDEO_VIEWS", "POST_ENGAGEMENT"].includes(ctx.objective) ? c.link.trim() : main;
        const card: Record<string, unknown> = { link: cardLink, ...mediaPart(c.media!) };
        if (c.headline.trim()) card.name = c.headline.trim();
        if (c.description.trim()) card.description = c.description.trim();
        if (cta) card.call_to_action = { ...cta, value: cta.value.link ? { ...cta.value, link: cardLink } : cta.value };
        return card;
      }),
      ...(cta ? { call_to_action: cta } : {}),
      ...(welcome ? { page_welcome_message: welcome } : {}),
    };
    return { object_story_spec: { ...base, link_data: linkData }, ...extras, ...optOut, ...messagingDestinations(ctx) };
  }

  // Tek görsel / video
  const media = ad.media;
  if (!media) throw new AdsError(`"${ad.name}": görsel ya da video seçin.`);
  if (ctx.objective === "VIDEO_VIEWS" && media.type !== "video") throw new AdsError(`"${ad.name}": video izlenme amacında video gerekli.`);

  if (ad.storyMedia) {
    // Yerleşime göre farklı medya: akış için asıl, hikaye / Reels için 9:16.
    if (ad.storyMedia.type !== media.type) throw new AdsError(`"${ad.name}": akış ve hikaye medyası aynı türde (ikisi de görsel ya da ikisi de video) olmalı.`);
    if (texts.length > 1 || heads.length > 1) throw new AdsError(`"${ad.name}": hikayeye özel medya kullanırken tek metin ve tek başlık olabilir (Meta kısıtı).`);
    const isImg = media.type === "image";
    const asset = (m: UploadedMedia, label: string) =>
      m.type === "image" ? { hash: m.hash, adlabels: [{ name: label }] } : { video_id: m.videoId, thumbnail_url: m.thumbUrl, adlabels: [{ name: label }] };
    const labelKey = isImg ? "image_label" : "video_label";
    const feed: Record<string, unknown> = {
      [isImg ? "images" : "videos"]: [asset(media, "feed"), asset(ad.storyMedia, "story")],
      bodies: [{ text: texts[0] }],
      ...(heads.length ? { titles: [{ text: heads[0] }] } : {}),
      ...(ad.description.trim() ? { descriptions: [{ text: ad.description.trim() }] } : {}),
      link_urls: [{ website_url: link ?? `https://www.facebook.com/${id.pageId}` }],
      call_to_action_types: [cta?.type ?? "LEARN_MORE"],
      ad_formats: [isImg ? "SINGLE_IMAGE" : "SINGLE_VIDEO"],
      optimization_type: "PLACEMENT",
      asset_customization_rules: [
        { customization_spec: { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["feed"], instagram_positions: ["stream"] }, [labelKey]: { name: "feed" } },
        { customization_spec: { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["story"], instagram_positions: ["story", "reels"] }, [labelKey]: { name: "story" } },
      ],
    };
    return { object_story_spec: base, asset_feed_spec: feed, ...extras, ...optOut };
  }

  // Birden çok metin / başlık: Meta en iyi kombinasyonu dener.
  const textOptions =
    texts.length > 1 || heads.length > 1
      ? { asset_feed_spec: { bodies: texts.map((text) => ({ text })), ...(heads.length ? { titles: heads.map((text) => ({ text })) } : {}), optimization_type: "DEGREES_OF_FREEDOM" } }
      : {};

  if (media.type === "video") {
    const video: Record<string, unknown> = { video_id: media.videoId, image_url: media.thumbUrl, message: texts[0] };
    if (heads[0]) video.title = heads[0];
    if (ad.description.trim()) video.link_description = ad.description.trim();
    if (cta) video.call_to_action = { ...cta, value: { ...cta.value, ...(link && !cta.value.link && !cta.value.lead_gen_form_id ? { link } : {}) } };
    if (welcome) video.page_welcome_message = welcome;
    return { object_story_spec: { ...base, video_data: video }, ...textOptions, ...extras, ...optOut, ...messagingDestinations(ctx) };
  }
  if (!link) return { object_story_spec: { ...base, photo_data: { image_hash: media.hash, caption: texts[0] } }, ...extras, ...optOut };
  const linkData: Record<string, unknown> = { link, message: texts[0], image_hash: media.hash };
  if (heads[0]) linkData.name = heads[0];
  if (ad.description.trim()) linkData.description = ad.description.trim();
  if (cta) linkData.call_to_action = cta;
  if (welcome) linkData.page_welcome_message = welcome;
  return { object_story_spec: { ...base, link_data: linkData }, ...textOptions, ...extras, ...optOut, ...messagingDestinations(ctx) };
}

// ---- Kampanya kurma ---------------------------------------------------------------------

/** Mevcut Instagram VİDEOSU (Reels) Facebook yerleşimlerinde de gösterilecekse Meta, videonun önce reklam hesabına
 * Facebook videosu olarak eklenmesini şart koşuyor. Seçilen Instagram videoları paralel eklenir ve hazır olması beklenir. */
async function prepareInstagramVideos(accountMetaId: string, ads: AdDraft[], t: string) {
  const ids = [...new Set(ads.filter((a) => a.format === "existing" && a.existing?.kind === "ig").map((a) => a.existing!.id))];
  await Promise.all(
    ids.map(async (mediaId) => {
      const m = await gGet<{ media_type?: string }>(mediaId, { fields: "media_type" }, t).catch(() => ({ media_type: undefined }));
      if (m.media_type !== "VIDEO") return;
      const v = await gPost<{ id: string }>(`${act(accountMetaId)}/advideos`, { source_instagram_media_id: mediaId }, t);
      await waitVideo(v.id, t);
    })
  );
}

function campaignObjective(d: CampaignDraft) {
  if (d.objective === "CONVERSIONS") {
    const ev = CONVERSION_EVENTS.find((e) => e.value === d.conversionEvent);
    return ev && !ev.sales ? "OUTCOME_LEADS" : "OUTCOME_SALES";
  }
  return OBJECTIVES[d.objective].objective;
}

function adsetCore(d: CampaignDraft, id: Identity) {
  const obj = OBJECTIVES[d.objective];
  const body: Record<string, unknown> = { billing_event: "IMPRESSIONS", optimization_goal: obj.optimization };
  if (d.objective === "MESSAGES") body.destination_type = MESSAGE_DESTINATIONS[d.destination].destination;
  else if (obj.destination) body.destination_type = obj.destination;
  if (d.objective === "CONVERSIONS") {
    if (!d.pixelId) throw new AdsError("Dönüşüm amacı için Meta pixel seçin.");
    body.promoted_object = { pixel_id: d.pixelId, custom_event_type: d.conversionEvent || "PURCHASE" };
  } else if (obj.promotesPage) {
    body.promoted_object = { page_id: id.pageId };
  }
  return body;
}

function validateDraft(d: CampaignDraft) {
  if (!OBJECTIVES[d.objective]) throw new AdsError("Kampanya amacı seçin.");
  if (!d.name.trim()) throw new AdsError("Kampanya adı boş olamaz.");
  if (d.adsets.length === 0) throw new AdsError("En az bir reklam seti olmalı.");
  if (d.budgetLevel === "campaign" && !(d.campaignBudget > 0)) throw new AdsError("Kampanya bütçesi girin.");
  if (d.abTest && d.adsets.length < 2) throw new AdsError("A/B testi için en az 2 reklam seti gerekir.");
  for (const s of d.adsets) {
    if (!s.name.trim()) throw new AdsError("Reklam seti adı boş olamaz.");
    if (d.budgetLevel === "adset" && !(s.budget > 0)) throw new AdsError(`"${s.name}": bütçe girin.`);
    if (d.bidStrategy !== "LOWEST_COST_WITHOUT_CAP" && !(Number(s.bidAmount) > 0)) throw new AdsError(`"${s.name}": maliyet hedefi / teklif tutarı girin.`);
    if (d.budgetType === "lifetime" && !s.endTime) throw new AdsError(`"${s.name}": toplam bütçede bitiş tarihi zorunlu.`);
    if (s.schedule && d.budgetType !== "lifetime") throw new AdsError(`"${s.name}": saatli yayın sadece toplam bütçede kullanılabilir.`);
    if (s.endTime && new Date(s.endTime).getTime() <= Math.max(Date.now(), s.startTime ? new Date(s.startTime).getTime() : 0)) {
      throw new AdsError(`"${s.name}": bitiş tarihi başlangıçtan ve şu andan sonra olmalı.`);
    }
    const a = s.audience;
    if (a.ageMin < 13 || a.ageMax > 65 || a.ageMin > a.ageMax) throw new AdsError(`"${s.name}": yaş aralığı 13-65 arasında olmalı.`);
    if (s.ads.length === 0) throw new AdsError(`"${s.name}": en az bir reklam olmalı.`);
  }
}

function adsetBody(d: CampaignDraft, s: CampaignDraft["adsets"][number], id: Identity, campaignId: string) {
  const body: Record<string, unknown> = {
    name: s.name.trim(),
    campaign_id: campaignId,
    status: "ACTIVE",
    ...adsetCore(d, id),
    targeting: buildTargeting(s.audience, d.specialCategory),
    start_time: isoOrUndef(s.startTime),
    end_time: isoOrUndef(s.endTime),
  };
  if (d.budgetLevel === "adset") {
    body[d.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = toMinor(s.budget);
    body.bid_strategy = d.bidStrategy;
  }
  if (d.bidStrategy !== "LOWEST_COST_WITHOUT_CAP") body.bid_amount = toMinor(Number(s.bidAmount));
  if (s.schedule && s.schedule.days.length) {
    body.pacing_type = ["day_parting"];
    body.adset_schedule = [{ start_minute: s.schedule.startHour * 60, end_minute: s.schedule.endHour * 60, days: s.schedule.days }];
  }
  if (s.frequency && d.objective === "REACH") {
    body.frequency_control_specs = [{ event: "IMPRESSIONS", interval_days: s.frequency.days, max_frequency: s.frequency.max }];
  }
  return body;
}

/** Kampanyayı, reklam setleri ve reklamlarıyla kurar. Kampanya duraklatılmış kurulur (activate ile hemen açılır). */
export async function createCampaignFull(accountMetaId: string, clientId: string | null, d: CampaignDraft) {
  validateDraft(d);
  const t = await token();
  const id = await identityFor(clientId, t);
  const ctx: CreativeCtx = { objective: d.objective, destination: d.destination, id };
  // Kreatifler kampanya açılmadan önce kontrol edilir (eksik bağlantı / medya varsa hiçbir şey kurulmaz).
  const creatives = d.adsets.map((s) => s.ads.map((a) => buildCreative(ctx, a)));
  await prepareInstagramVideos(accountMetaId, d.adsets.flatMap((s) => s.ads), t);

  const special = d.specialCategory ? [d.specialCategory] : [];
  const campBody: Record<string, unknown> = {
    name: d.name.trim(),
    objective: campaignObjective(d),
    status: "PAUSED",
    special_ad_categories: special,
    ...(special.length ? { special_ad_category_country: ["TR"] } : {}),
    ...(d.spendCap && d.spendCap > 0 ? { spend_cap: toMinor(d.spendCap) } : {}),
  };
  if (d.budgetLevel === "campaign") {
    campBody[d.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = toMinor(d.campaignBudget);
    campBody.bid_strategy = d.bidStrategy;
  } else {
    campBody.is_adset_budget_sharing_enabled = false;
  }
  const campaign = await gPost<{ id: string }>(`${act(accountMetaId)}/campaigns`, campBody, t);
  const warnings: string[] = [];
  try {
    const adsetIds: string[] = [];
    for (const [i, s] of d.adsets.entries()) {
      const set = await gPost<{ id: string }>(`${act(accountMetaId)}/adsets`, adsetBody(d, s, id, campaign.id), t);
      adsetIds.push(set.id);
      for (const [j, a] of s.ads.entries()) {
        await gPost(
          `${act(accountMetaId)}/ads`,
          { name: (a.name.trim() || `Reklam ${j + 1}`).slice(0, 200), adset_id: set.id, status: "ACTIVE", creative: creatives[i][j] },
          t
        );
      }
    }
    if (d.abTest && adsetIds.length >= 2) {
      try {
        await createSplitTest(accountMetaId, d, adsetIds, t);
      } catch (e) {
        warnings.push(`A/B testi başlatılamadı (${e instanceof Error ? e.message : "bilinmeyen hata"}); reklam setleri normal kampanya olarak kuruldu.`);
      }
    }
    if (d.activate) await gPost(campaign.id, { status: "ACTIVE" }, t);
  } catch (e) {
    await gDelete(campaign.id, t).catch(() => {});
    throw e;
  }
  await syncAccountCampaigns(accountMetaId).catch(() => {});
  return { campaignId: campaign.id, activated: d.activate, warnings };
}

/** A/B testi (Meta "Split Test" çalışması): reklam setleri kitleyi bölüşür, kazanan raporlanır. */
async function createSplitTest(accountMetaId: string, d: CampaignDraft, adsetIds: string[], t: string) {
  const accInfo = await gGet<{ business?: { id: string } }>(act(accountMetaId), { fields: "business" }, t);
  const bizId = accInfo.business?.id;
  if (!bizId) throw new AdsError("reklam hesabının işletmesi bulunamadı");
  const starts = d.adsets.map((s) => (s.startTime ? new Date(s.startTime).getTime() : Date.now() + 10 * 60 * 1000));
  const ends = d.adsets.map((s) => (s.endTime ? new Date(s.endTime).getTime() : Date.now() + 14 * 86400e3));
  const n = adsetIds.length;
  const share = Math.floor(100 / n);
  await gPost(
    `${bizId}/ad_studies`,
    {
      name: `${d.name} - A/B testi`,
      type: "SPLIT_TEST",
      start_time: Math.floor(Math.max(...starts) / 1000),
      end_time: Math.floor(Math.min(...ends) / 1000),
      cells: adsetIds.map((sid, i) => ({ name: d.adsets[i].name, treatment_percentage: i === n - 1 ? 100 - share * (n - 1) : share, adsets: [sid] })),
    },
    t
  );
}

/** Reklamın Meta önizlemesi (iframe HTML). */
export async function previewAd(accountMetaId: string, clientId: string | null, ctxIn: { objective: ObjectiveKey; destination: MessageDestination }, ad: AdDraft, format: string) {
  const t = await token();
  const id = await identityFor(clientId, t);
  const creative = buildCreative({ ...ctxIn, id }, ad);
  const res = await gGet<{ data: { body: string }[] }>(`${act(accountMetaId)}/generatepreviews`, { ad_format: format, creative: JSON.stringify(creative) }, t);
  return res.data[0]?.body ?? "";
}

// ---- Kampanya penceresi için varlıklar ---------------------------------------------------

export async function composerAssets(accountMetaId: string, clientId: string | null): Promise<Omit<ComposerContext, "media" | "page" | "instagram">> {
  const t = await token();
  const social = clientId ? await prisma.socialAccount.findFirst({ where: { clientId }, orderBy: { createdAt: "asc" } }) : null;
  const [pixels, audiences] = await Promise.all([
    gGet<{ data: { id: string; name: string }[] }>(`${act(accountMetaId)}/adspixels`, { fields: "id,name", limit: "50" }, t).catch(() => ({ data: [] })),
    gGet<{ data: { id: string; name: string; subtype?: string; approximate_count_lower_bound?: number }[] }>(
      `${act(accountMetaId)}/customaudiences`,
      { fields: "id,name,subtype,approximate_count_lower_bound", limit: "100" },
      t
    ).catch(() => ({ data: [] })),
  ]);
  let leadForms: ComposerContext["leadForms"] = [];
  let leadTosAccepted = false;
  if (social) {
    try {
      const pt = await pageToken(social.pageId, t);
      const [forms, tos] = await Promise.all([
        gGet<{ data: { id: string; name: string; status: string }[] }>(`${social.pageId}/leadgen_forms`, { fields: "id,name,status", limit: "100" }, pt),
        gGet<{ leadgen_tos_accepted?: boolean }>(social.pageId, { fields: "leadgen_tos_accepted" }, pt),
      ]);
      leadForms = forms.data.filter((f) => f.status === "ACTIVE");
      leadTosAccepted = !!tos.leadgen_tos_accepted;
    } catch {
      // Sayfa jetonu alınamazsa form listesi boş kalır.
    }
  }
  const TYPE: Record<string, string> = { ENGAGEMENT: "Etkileşim", LOOKALIKE: "Benzer kitle", CUSTOM: "Müşteri listesi", WEBSITE: "Web sitesi", VIDEO: "Video izleyen", IG_BUSINESS: "Instagram" };
  return {
    pageId: social?.pageId ?? null,
    pixels: pixels.data,
    audiences: audiences.data.map((a) => ({ id: a.id, name: a.name, type: TYPE[a.subtype ?? ""] ?? a.subtype ?? "Özel", size: a.approximate_count_lower_bound ?? null })),
    leadForms,
    leadTosAccepted,
    leadTosUrl: social ? `https://www.facebook.com/ads/leadgen/tos?page_id=${social.pageId}` : null,
  };
}

/** Öne çıkarılabilecek son Facebook ve Instagram gönderileri. */
export async function existingPosts(clientId: string | null): Promise<ExistingPost[]> {
  const t = await token();
  const social = await socialFor(clientId);
  const out: ExistingPost[] = [];
  try {
    const pt = await pageToken(social.pageId, t);
    const fb = await gGet<{ data: { id: string; message?: string; full_picture?: string; created_time: string; permalink_url?: string }[] }>(
      `${social.pageId}/published_posts`,
      { fields: "id,message,full_picture,created_time,permalink_url", limit: "25" },
      pt
    );
    for (const p of fb.data) out.push({ kind: "fb", id: p.id, thumb: p.full_picture ?? null, text: p.message ?? null, date: p.created_time, permalink: p.permalink_url ?? null });
  } catch {
    // Facebook gönderileri okunamazsa sadece Instagram listelenir.
  }
  if (social.igId) {
    try {
      const ig = await gGet<{ data: { id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string; timestamp: string; permalink?: string }[] }>(
        `${social.igId}/media`,
        { fields: "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink", limit: "25" },
        t
      );
      for (const p of ig.data) {
        out.push({ kind: "ig", id: p.id, thumb: p.media_type === "VIDEO" ? (p.thumbnail_url ?? null) : (p.media_url ?? null), text: p.caption ?? null, date: p.timestamp, permalink: p.permalink ?? null });
      }
    } catch {
      // yoksay
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---- Kitle / form oluşturma --------------------------------------------------------------

/** Instagram hesabıyla ya da Facebook sayfasıyla etkileşime girenlerden özel kitle. */
export async function createEngagementAudience(accountMetaId: string, clientId: string | null, source: "ig" | "page", days: number, name: string) {
  const t = await token();
  const social = await socialFor(clientId);
  if (source === "ig" && !social.igId) throw new AdsError("Bu müşterinin Instagram hesabı bağlı değil.");
  const rule = {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [source === "ig" ? { id: social.igId, type: "ig_business" } : { id: social.pageId, type: "page" }],
          retention_seconds: Math.min(Math.max(days, 1), 365) * 86400,
          filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: source === "ig" ? "ig_business_profile_all" : "page_engaged" }] },
        },
      ],
    },
  };
  return gPost<{ id: string }>(`${act(accountMetaId)}/customaudiences`, { name, rule, prefill: true }, t);
}

/** Benzer kitle (Türkiye, %1-10). Kaynak kitlede en az 100 kişi olmalı. */
export async function createLookalike(accountMetaId: string, sourceId: string, ratio: number, name: string) {
  const t = await token();
  return gPost<{ id: string }>(
    `${act(accountMetaId)}/customaudiences`,
    { name, subtype: "LOOKALIKE", origin_audience_id: sourceId, lookalike_spec: { type: "similarity", country: "TR", ratio: Math.min(Math.max(ratio, 1), 10) / 100 } },
    t
  );
}

export type LeadFormInput = {
  name: string;
  questions: string[];
  privacyUrl: string;
  privacyText: string;
  intro: string;
  thankTitle: string;
  thankBody: string;
  website: string;
};

/** Sayfada anlık form oluşturur (sayfa Meta'nın form koşullarını kabul etmiş olmalı). */
export async function createLeadForm(clientId: string | null, f: LeadFormInput) {
  const t = await token();
  const social = await socialFor(clientId);
  const pt = await pageToken(social.pageId, t);
  if (!httpOk(f.privacyUrl)) throw new AdsError("Gizlilik politikası bağlantısı http(s):// ile başlamalı.");
  if (f.questions.length === 0) throw new AdsError("En az bir soru seçin.");
  const body: Record<string, unknown> = {
    name: f.name.trim() || "Form",
    locale: "TR_TR",
    questions: f.questions.map((type) => ({ type })),
    privacy_policy: { url: f.privacyUrl.trim(), link_text: f.privacyText.trim() || "Gizlilik politikası" },
    thank_you_page: {
      title: f.thankTitle.trim() || "Teşekkürler!",
      body: f.thankBody.trim() || "Bilgilerinizi aldık, en kısa sürede size dönüş yapacağız.",
      button_type: httpOk(f.website) ? "VIEW_WEBSITE" : "NONE",
      ...(httpOk(f.website) ? { website_url: f.website.trim(), button_text: "Web sitesine git" } : {}),
    },
  };
  if (f.intro.trim()) body.context_card = { title: f.name.trim() || "Form", style: "PARAGRAPH_STYLE", content: [f.intro.trim()] };
  return gPost<{ id: string }>(`${social.pageId}/leadgen_forms`, body, pt);
}

// ---- Arama ------------------------------------------------------------------------------

export async function searchLocations(q: string): Promise<LocationPick[]> {
  const t = await token();
  const res = await gGet<{ data: { key: string; name: string; type: string; country_code?: string; region?: string }[] }>(
    "search",
    { type: "adgeolocation", q, location_types: JSON.stringify(["country", "region", "city", "medium_geo_area", "neighborhood"]), locale: "tr_TR", limit: "15" },
    t
  );
  return res.data
    .filter((d) => ["country", "region", "city", "medium_geo_area", "neighborhood"].includes(d.type))
    .map((d) => ({
      key: d.type === "country" ? (d.country_code ?? d.key) : d.key,
      type: d.type as LocationPick["type"],
      name: d.type !== "country" && d.type !== "region" && d.region ? `${d.name} (${d.region.replace(/ Province$/, "")})` : d.name,
      ...(d.type === "city" ? { radius: 25 } : {}),
    }));
}

/** Detaylı hedefleme: ilgi alanı, davranış ve demografi tek aramada. */
export async function searchDetailed(accountMetaId: string, q: string) {
  const t = await token();
  const res = await gGet<{ data: { id: string; name: string; type: string; path?: string[]; audience_size_upper_bound?: number }[] }>(
    `${act(accountMetaId)}/targetingsearch`,
    { q, locale: "tr_TR", limit: "20" },
    t
  );
  return res.data.map((d) => ({ id: d.id, name: d.name, type: d.type, size: d.audience_size_upper_bound ?? null, path: (d.path ?? []).slice(0, -1).join(" › ") }));
}

export async function searchLocales(q: string) {
  const t = await token();
  const res = await gGet<{ data: { key: number; name: string }[] }>("search", { type: "adlocale", q, locale: "tr_TR", limit: "10" }, t);
  return res.data;
}

// ---- Kopyalama --------------------------------------------------------------------------

type SrcAdSet = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  campaign_id?: string;
  targeting?: Record<string, unknown>;
  optimization_goal?: string;
  billing_event?: string;
  destination_type?: string;
  promoted_object?: Record<string, unknown>;
  attribution_spec?: unknown;
  bid_strategy?: string;
  bid_amount?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  pacing_type?: string[];
  adset_schedule?: unknown;
  frequency_control_specs?: unknown;
};
type SrcCreative = {
  object_story_spec?: Record<string, Record<string, unknown> | string>;
  object_story_id?: string;
  effective_object_story_id?: string;
  source_instagram_media_id?: string;
  instagram_user_id?: string;
  asset_feed_spec?: Record<string, unknown>;
  url_tags?: string;
  call_to_action?: unknown;
};
type SrcAd = { id: string; name: string; status: string; effective_status: string; creative?: SrcCreative };

const ADSET_FIELDS =
  "id,name,status,effective_status,campaign_id,targeting,optimization_goal,billing_event,destination_type,promoted_object,attribution_spec,bid_strategy,bid_amount,daily_budget,lifetime_budget,start_time,end_time,pacing_type,adset_schedule,frequency_control_specs";
const AD_FIELDS =
  "id,name,status,effective_status,creative{object_story_spec,object_story_id,effective_object_story_id,source_instagram_media_id,instagram_user_id,asset_feed_spec,url_tags,call_to_action}";

/** Eski kampanyalarda Meta'nın artık kabul etmediği ayarlar taşınmasın diye kreatif yalnızca içeriğiyle yeniden kurulur. */
function cloneCreative(c?: SrcCreative): Record<string, unknown> | null {
  if (!c) return null;
  const tags = c.url_tags ? { url_tags: c.url_tags } : {};
  if (c.source_instagram_media_id) {
    return { source_instagram_media_id: c.source_instagram_media_id, ...(c.instagram_user_id ? { instagram_user_id: c.instagram_user_id } : {}), ...(c.call_to_action ? { call_to_action: c.call_to_action } : {}), ...tags };
  }
  if (c.object_story_spec) {
    const spec = JSON.parse(JSON.stringify(c.object_story_spec)) as Record<string, Record<string, unknown> | string>;
    for (const key of ["link_data", "video_data", "photo_data"]) {
      const part = spec[key];
      if (part && typeof part === "object" && part.image_hash && part.image_url) delete part.image_url;
    }
    const feed = c.asset_feed_spec ? { asset_feed_spec: c.asset_feed_spec } : {};
    return { object_story_spec: spec, ...feed, ...tags };
  }
  const storyId = c.effective_object_story_id ?? c.object_story_id;
  return storyId ? { object_story_id: storyId, ...tags } : null;
}

function cloneTargeting(t: Record<string, unknown> | undefined) {
  const out = { ...(t ?? {}) };
  delete out.age_range;
  delete out.targeting_optimization;
  // Meta artık detaylı hedefleme hariç tutmalarını kabul etmiyor.
  delete out.exclusions;
  return out;
}

async function cloneAdSetInto(
  s: SrcAdSet,
  campaignId: string,
  accountMetaId: string,
  opts: { cbo: boolean; startTime: string | null; endTime: string | null; budget: number | null; name: string },
  t: string,
  skipped: string[]
) {
  const body: Record<string, unknown> = {
    name: opts.name,
    campaign_id: campaignId,
    status: "ACTIVE",
    targeting: cloneTargeting(s.targeting),
    optimization_goal: s.optimization_goal,
    billing_event: s.billing_event ?? "IMPRESSIONS",
    destination_type: s.destination_type,
    // İlişkilendirme aralığı taşınmaz: Meta izin verilen aralıkları sık değiştiriyor (ör. mesajda artık sadece 1 gün tıklama);
    // eski kampanyanın ayarı reddedilmesin diye yeni sette Meta'nın varsayılanı kullanılır.
    start_time: isoOrUndef(opts.startTime),
    end_time: isoOrUndef(opts.endTime),
  };
  if (s.promoted_object) {
    const po = { ...s.promoted_object };
    delete po.smart_pse_enabled;
    body.promoted_object = po;
  }
  if (s.pacing_type?.includes("day_parting") && s.adset_schedule) {
    body.pacing_type = s.pacing_type;
    body.adset_schedule = s.adset_schedule;
  }
  if (s.frequency_control_specs) body.frequency_control_specs = s.frequency_control_specs;
  if (!opts.cbo) {
    if (positive(s.daily_budget)) body.daily_budget = opts.budget ?? Number(s.daily_budget);
    else if (positive(s.lifetime_budget)) body.lifetime_budget = Number(s.lifetime_budget);
    body.bid_strategy = s.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP";
  }
  if (positive(s.bid_amount)) body.bid_amount = Number(s.bid_amount);
  const newSet = await gPost<{ id: string }>(`${act(accountMetaId)}/adsets`, body, t);

  const adsAll = (await gGet<{ data: SrcAd[] }>(`${s.id}/ads`, { fields: AD_FIELDS, limit: "50" }, t)).data.filter((a) => LIVE(a.effective_status));
  const ads = adsAll.some((a) => a.status === "ACTIVE") ? adsAll.filter((a) => a.status === "ACTIVE") : adsAll;
  let made = 0;
  for (const a of ads) {
    const creative = cloneCreative(a.creative);
    if (!creative) {
      skipped.push(a.name);
      continue;
    }
    await gPost(`${act(accountMetaId)}/ads`, { name: a.name, adset_id: newSet.id, status: "ACTIVE", creative }, t);
    made++;
  }
  if (made === 0) throw new AdsError(`"${s.name}" reklam setindeki reklamlar kopyalanamadı.`);
  return newSet.id;
}

/** Kampanyayı reklam setleri ve reklamlarıyla birlikte yeni tarih / bütçeyle kopyalar (yeni kampanya duraklatılmış kurulur). */
export async function copyCampaign(campaignMetaId: string, copy: CopySpec) {
  const t = await token();
  const src = await gGet<{
    id: string;
    name: string;
    objective: string;
    special_ad_categories?: string[];
    special_ad_category_country?: string[];
    daily_budget?: string;
    lifetime_budget?: string;
    bid_strategy?: string;
    spend_cap?: string;
    account_id: string;
  }>(campaignMetaId, { fields: "id,name,objective,special_ad_categories,special_ad_category_country,daily_budget,lifetime_budget,bid_strategy,spend_cap,account_id" }, t);
  const adsetsAll = (await gGet<{ data: SrcAdSet[] }>(`${campaignMetaId}/adsets`, { fields: ADSET_FIELDS, limit: "50" }, t)).data.filter((s) => LIVE(s.effective_status));
  const adsets = adsetsAll.some((s) => s.status === "ACTIVE") ? adsetsAll.filter((s) => s.status === "ACTIVE") : adsetsAll;
  if (adsets.length === 0) throw new AdsError("Kopyalanacak reklam seti bulunamadı.");

  const cbo = positive(src.daily_budget) || positive(src.lifetime_budget);
  const lifetime = positive(src.lifetime_budget) || adsets.some((s) => positive(s.lifetime_budget));
  if (lifetime && !copy.endTime) throw new AdsError("Bu kampanya toplam bütçeli; kopya için bitiş tarihi girin.");
  if (copy.endTime && new Date(copy.endTime).getTime() <= Math.max(Date.now(), copy.startTime ? new Date(copy.startTime).getTime() : 0)) {
    throw new AdsError("Bitiş tarihi başlangıçtan ve şu andan sonra olmalı.");
  }
  const newBudget = copy.dailyBudget && copy.dailyBudget > 0 ? toMinor(copy.dailyBudget) : null;

  const campaignBody: Record<string, unknown> = {
    name: copy.name.trim() || `${src.name} - Kopya`,
    objective: src.objective,
    status: "PAUSED",
    special_ad_categories: src.special_ad_categories ?? [],
    ...(src.special_ad_categories?.length ? { special_ad_category_country: src.special_ad_category_country ?? ["TR"] } : {}),
    ...(positive(src.spend_cap) ? { spend_cap: Number(src.spend_cap) } : {}),
  };
  if (cbo) {
    if (positive(src.daily_budget)) campaignBody.daily_budget = newBudget ?? Number(src.daily_budget);
    else campaignBody.lifetime_budget = Number(src.lifetime_budget);
    campaignBody.bid_strategy = src.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP";
  } else {
    campaignBody.is_adset_budget_sharing_enabled = false;
  }

  const accountMetaId = src.account_id;
  const created = await gPost<{ id: string }>(`${act(accountMetaId)}/campaigns`, campaignBody, t);
  const skipped: string[] = [];
  try {
    for (const s of adsets) {
      await cloneAdSetInto(
        s,
        created.id,
        accountMetaId,
        { cbo, startTime: copy.startTime, endTime: copy.endTime, budget: adsets.length === 1 ? newBudget : null, name: s.name },
        t,
        skipped
      );
    }
    if (copy.activate) await gPost(created.id, { status: "ACTIVE" }, t);
  } catch (e) {
    await gDelete(created.id, t).catch(() => {});
    throw e;
  }
  await syncAccountCampaigns(accountMetaId).catch(() => {});
  return { campaignId: created.id, skipped, activated: copy.activate };
}

/** Reklam setini aynı kampanya içinde çoğaltır (reklamlarıyla). Yeni set duraklatılmış kurulur. */
export async function duplicateAdSet(adsetId: string, name: string) {
  const t = await token();
  const s = await gGet<SrcAdSet & { campaign?: { daily_budget?: string; lifetime_budget?: string }; account_id: string }>(
    adsetId,
    { fields: `${ADSET_FIELDS},account_id,campaign{daily_budget,lifetime_budget}` },
    t
  );
  const cbo = positive(s.campaign?.daily_budget) || positive(s.campaign?.lifetime_budget);
  const endOk = s.end_time && new Date(s.end_time).getTime() > Date.now() ? s.end_time : null;
  if (positive(s.lifetime_budget) && !endOk) throw new AdsError("Toplam bütçeli reklam setinin bitiş tarihi geçmiş; önce bitişi uzatın.");
  const skipped: string[] = [];
  const newId = await cloneAdSetInto(s, s.campaign_id!, s.account_id, { cbo, startTime: null, endTime: endOk, budget: null, name: name.trim() || `${s.name} - Kopya` }, t, skipped);
  await gPost(newId, { status: "PAUSED" }, t);
  await syncAccountCampaigns(s.account_id).catch(() => {});
  return { adsetId: newId, skipped };
}

// ---- Durum / düzenleme / silme ----------------------------------------------------------

export async function objectAccountId(objectId: string) {
  const t = await token();
  const c = await gGet<{ account_id: string }>(objectId, { fields: "account_id" }, t);
  return c.account_id;
}

/** Kampanyayı, reklam setini ya da reklamı açar / durdurur. */
export async function setObjectStatus(objectId: string, status: "ACTIVE" | "PAUSED", level: "campaign" | "adset" | "ad") {
  const t = await token();
  if (status === "ACTIVE" && level === "campaign") {
    const sets = (await gGet<{ data: SrcAdSet[] }>(`${objectId}/adsets`, { fields: "id,status,effective_status,end_time", limit: "50" }, t)).data.filter((s) => LIVE(s.effective_status));
    const open = sets.filter((s) => s.status === "ACTIVE");
    if (open.length === 0) throw new AdsError("Kampanyada açık reklam seti yok.");
    if (open.every((s) => s.end_time && new Date(s.end_time).getTime() < Date.now())) {
      throw new AdsError("Kampanyanın bitiş tarihi geçmiş. Önce \"Düzenle\"den bitiş tarihini uzatın ya da kampanyayı kopyalayın.");
    }
  }
  await gPost(objectId, { status }, t);
  await syncAccountCampaigns(await objectAccountId(objectId)).catch(() => {});
}

/** Kalıcı silme (kampanya / reklam seti / reklam) ya da kampanyayı arşivleme. */
export async function removeObject(objectId: string, mode: "delete" | "archive") {
  const t = await token();
  const accountId = await objectAccountId(objectId);
  if (mode === "archive") await gPost(objectId, { status: "ARCHIVED" }, t);
  else await gDelete(objectId, t);
  await syncAccountCampaigns(accountId).catch(() => {});
  if (mode === "delete") await prisma.adCampaign.deleteMany({ where: { metaId: objectId } });
}

/** Kampanya adı, günlük bütçe, harcama limiti ve / veya bitiş tarihi (endTime: undefined = dokunma, null = bitişi kaldır). */
export async function updateCampaign(campaignMetaId: string, input: { dailyBudget?: number | null; endTime?: string | null; name?: string; spendCap?: number | null }) {
  const t = await token();
  const c = await gGet<{ account_id: string; daily_budget?: string; lifetime_budget?: string; name: string }>(campaignMetaId, { fields: "account_id,daily_budget,lifetime_budget,name" }, t);
  const sets = (await gGet<{ data: SrcAdSet[] }>(`${campaignMetaId}/adsets`, { fields: "id,status,effective_status,daily_budget,lifetime_budget,end_time", limit: "50" }, t)).data.filter((s) => LIVE(s.effective_status));

  if (input.name !== undefined && input.name.trim() && input.name.trim() !== c.name) await gPost(campaignMetaId, { name: input.name.trim() }, t);
  if (input.spendCap !== undefined) await gPost(campaignMetaId, { spend_cap: input.spendCap && input.spendCap > 0 ? toMinor(input.spendCap) : 922337203685478 }, t);
  if (input.dailyBudget != null) {
    if (!(input.dailyBudget > 0)) throw new AdsError("Günlük bütçe sıfırdan büyük olmalı.");
    if (positive(c.daily_budget)) await gPost(campaignMetaId, { daily_budget: toMinor(input.dailyBudget) }, t);
    else if (positive(c.lifetime_budget)) throw new AdsError("Bu kampanya toplam bütçeli; günlük bütçe değiştirilemez.");
    else {
      const daily = sets.filter((s) => positive(s.daily_budget));
      if (daily.length !== 1) throw new AdsError("Bu kampanyada bütçe birden fazla reklam setine bölünmüş; bütçeyi Ayrıntı > reklam seti düzenle'den değiştirin.");
      await gPost(daily[0].id, { daily_budget: toMinor(input.dailyBudget) }, t);
    }
  }
  if (input.endTime !== undefined) {
    if (input.endTime && new Date(input.endTime).getTime() <= Date.now()) throw new AdsError("Bitiş tarihi ileri bir tarih olmalı.");
    for (const s of sets) {
      if (!input.endTime && positive(s.lifetime_budget)) throw new AdsError("Toplam bütçeli reklam setinde bitiş tarihi kaldırılamaz.");
      await gPost(s.id, { end_time: input.endTime ? new Date(input.endTime).toISOString() : 0 }, t);
    }
  }
  await syncAccountCampaigns(c.account_id).catch(() => {});
}

export type AdSetEdit = {
  id: string;
  name: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  endTime: string | null;
  special: boolean;
  audience: AudienceDraft;
};

export async function getAdSetEdit(adsetId: string): Promise<AdSetEdit> {
  const t = await token();
  const s = await gGet<SrcAdSet & { campaign?: { special_ad_categories?: string[] } }>(adsetId, { fields: `${ADSET_FIELDS},campaign{special_ad_categories}` }, t);
  return {
    id: s.id,
    name: s.name,
    dailyBudget: positive(s.daily_budget) ? Number(s.daily_budget) / 100 : null,
    lifetimeBudget: positive(s.lifetime_budget) ? Number(s.lifetime_budget) / 100 : null,
    endTime: s.end_time ?? null,
    special: (s.campaign?.special_ad_categories ?? []).length > 0,
    audience: targetingToDraft(s.targeting ?? {}),
  };
}

/** Reklam setinin adı, bütçesi, bitişi ve hedef kitlesi / yerleşimleri. */
export async function updateAdSet(adsetId: string, input: { name?: string; budget?: number | null; endTime?: string | null; audience?: AudienceDraft }) {
  const t = await token();
  const s = await gGet<SrcAdSet & { account_id: string; campaign?: { special_ad_categories?: string[] } }>(
    adsetId,
    { fields: "id,name,daily_budget,lifetime_budget,targeting,account_id,campaign{special_ad_categories}" },
    t
  );
  const body: Record<string, unknown> = {};
  if (input.name !== undefined && input.name.trim() && input.name.trim() !== s.name) body.name = input.name.trim();
  if (input.budget != null) {
    if (!(input.budget > 0)) throw new AdsError("Bütçe sıfırdan büyük olmalı.");
    if (positive(s.daily_budget)) body.daily_budget = toMinor(input.budget);
    else if (positive(s.lifetime_budget)) body.lifetime_budget = toMinor(input.budget);
    else throw new AdsError("Bu reklam setinin bütçesi kampanya düzeyinde; kampanyadan değiştirin.");
  }
  if (input.endTime !== undefined) {
    if (input.endTime && new Date(input.endTime).getTime() <= Date.now()) throw new AdsError("Bitiş tarihi ileri bir tarih olmalı.");
    body.end_time = input.endTime ? new Date(input.endTime).toISOString() : 0;
  }
  if (input.audience) {
    const special = (s.campaign?.special_ad_categories?.[0] ?? "") as SpecialCategory;
    body.targeting = buildTargeting(input.audience, special, cloneTargeting(s.targeting));
  }
  if (Object.keys(body).length) await gPost(adsetId, body, t);
  await syncAccountCampaigns(s.account_id).catch(() => {});
}

/** Reklam setinin amacına göre (yeni reklam eklerken) taslak bağlamı. */
async function contextForAdSet(adsetId: string, t: string) {
  const s = await gGet<{ optimization_goal?: string; destination_type?: string; account_id: string; campaign?: { id: string } }>(
    adsetId,
    { fields: "optimization_goal,destination_type,account_id,campaign{id}" },
    t
  );
  const map: Record<string, ObjectiveKey> = {
    CONVERSATIONS: "MESSAGES",
    PROFILE_VISIT: "PROFILE",
    LINK_CLICKS: "TRAFFIC",
    LANDING_PAGE_VIEWS: "LANDING",
    LEAD_GENERATION: "LEADS_FORM",
    OFFSITE_CONVERSIONS: "CONVERSIONS",
    REACH: "REACH",
    THRUPLAY: "VIDEO_VIEWS",
    POST_ENGAGEMENT: "POST_ENGAGEMENT",
    PAGE_LIKES: "PAGE_LIKES",
  };
  const objective = map[s.optimization_goal ?? ""] ?? "TRAFFIC";
  const destination = (Object.entries(MESSAGE_DESTINATIONS).find(([, v]) => v.destination === s.destination_type)?.[0] ?? "IG") as MessageDestination;
  return { objective, destination, accountId: s.account_id };
}

export async function adSetObjective(adsetId: string) {
  const t = await token();
  const c = await contextForAdSet(adsetId, t);
  return { objective: c.objective, destination: c.destination };
}

/** Var olan reklam setine yeni reklam ekler. */
export async function addAdToAdSet(adsetId: string, clientId: string | null, ad: AdDraft) {
  const t = await token();
  const c = await contextForAdSet(adsetId, t);
  const id = await identityFor(clientId, t);
  const creative = buildCreative({ objective: c.objective, destination: c.destination, id }, ad);
  await prepareInstagramVideos(c.accountId, [ad], t);
  const res = await gPost<{ id: string }>(`${act(c.accountId)}/ads`, { name: ad.name.trim() || "Reklam", adset_id: adsetId, status: "ACTIVE", creative }, t);
  await syncAccountCampaigns(c.accountId).catch(() => {});
  return res.id;
}

export type AdTextEdit = { text: string; headline: string; description: string; link: string; cta: string | null; editable: boolean; reason: string | null };

type AdCreativeFull = { id: string; object_story_spec?: Record<string, Record<string, unknown> | string>; asset_feed_spec?: unknown; url_tags?: string };

async function adCreative(adId: string, t: string) {
  return gGet<{ name: string; account_id: string; creative?: AdCreativeFull }>(
    adId,
    { fields: "name,account_id,creative{id,object_story_spec,asset_feed_spec,url_tags}" },
    t
  );
}

export async function getAdText(adId: string): Promise<AdTextEdit> {
  const t = await token();
  const a = await adCreative(adId, t);
  const spec = a.creative?.object_story_spec;
  const part = (spec?.link_data ?? spec?.video_data) as Record<string, unknown> | undefined;
  if (!part || a.creative?.asset_feed_spec) {
    return {
      text: "",
      headline: "",
      description: "",
      link: "",
      cta: null,
      editable: false,
      reason: a.creative?.asset_feed_spec
        ? "Bu reklam çoklu metin / yerleşime özel medya kullanıyor; metnini Meta Reklam Yöneticisi'nden düzenleyin."
        : "Mevcut gönderiyle kurulan reklamın metni gönderinin kendisidir; değiştirilemez.",
    };
  }
  const cta = part.call_to_action as { type?: string; value?: { link?: string } } | undefined;
  return {
    text: String(part.message ?? ""),
    headline: String(part.name ?? part.title ?? ""),
    description: String(part.description ?? part.link_description ?? ""),
    link: String(spec?.link_data ? ((spec.link_data as Record<string, unknown>).link ?? "") : (cta?.value?.link ?? "")),
    cta: cta?.type ?? null,
    editable: true,
    reason: null,
  };
}

/** Reklamın metnini / başlığını / bağlantısını değiştirir: yeni kreatif oluşturulup reklama bağlanır. */
export async function updateAdText(adId: string, input: { text: string; headline: string; description: string; link: string; cta: string | null }) {
  const t = await token();
  const a = await adCreative(adId, t);
  const spec = a.creative?.object_story_spec ? (JSON.parse(JSON.stringify(a.creative.object_story_spec)) as Record<string, Record<string, unknown>>) : null;
  if (!spec || a.creative?.asset_feed_spec) throw new AdsError("Bu reklamın metni buradan düzenlenemez.");
  if (!input.text.trim()) throw new AdsError("Reklam metni boş olamaz.");
  const isLink = !!spec.link_data;
  const part = (spec.link_data ?? spec.video_data) as Record<string, unknown>;
  if (part.image_hash && part.image_url) delete part.image_url;
  part.message = input.text.trim();
  if (isLink) {
    if (input.headline.trim()) part.name = input.headline.trim();
    else delete part.name;
    if (input.description.trim()) part.description = input.description.trim();
    else delete part.description;
  } else {
    if (input.headline.trim()) part.title = input.headline.trim();
    else delete part.title;
    if (input.description.trim()) part.link_description = input.description.trim();
    else delete part.link_description;
  }
  const cta = part.call_to_action as { type: string; value: Record<string, unknown> } | undefined;
  const linkEditable = cta && cta.value && typeof cta.value.link === "string" && !String(cta.value.link).includes("instagram.com/") && !cta.value.app_destination;
  if (linkEditable && input.link.trim()) {
    if (!httpOk(input.link)) throw new AdsError("Bağlantı http(s):// ile başlamalı.");
    cta.value.link = input.link.trim();
    if (isLink) part.link = input.link.trim();
    if (input.cta) cta.type = input.cta;
  }
  const creative = await gPost<{ id: string }>(
    `${act(a.account_id)}/adcreatives`,
    { name: `${a.name} (düzenlendi)`, object_story_spec: spec, ...(a.creative?.url_tags ? { url_tags: a.creative.url_tags } : {}) },
    t
  );
  await gPost(adId, { creative: { creative_id: creative.id } }, t);
  await syncAccountCampaigns(a.account_id).catch(() => {});
}

// ---- Ayrıntı ----------------------------------------------------------------------------

const GENDER = (g?: number[]) => (!g?.length || g.length === 2 ? "Tümü" : g[0] === 1 ? "Erkek" : "Kadın");

function targetingSummary(t: Record<string, unknown> | undefined) {
  const geo = (t?.geo_locations ?? {}) as Record<string, { name?: string; key: string; radius?: number; distance_unit?: string; address_string?: string; latitude?: number; longitude?: number }[] | string[]>;
  const unit = (u?: string) => (u === "mile" ? "mil" : "km");
  const objs = (k: string) => ((geo[k] as { name?: string; key: string; radius?: number; distance_unit?: string; address_string?: string; latitude?: number; longitude?: number }[] | undefined) ?? []);
  const locs = [
    ...((geo.countries as string[] | undefined) ?? []).map((c) => (c === "TR" ? "Türkiye" : c)),
    ...objs("regions").map((r) => r.name ?? r.key),
    ...objs("cities").map((c) => `${c.name ?? c.key}${c.radius ? ` (+${c.radius} ${unit(c.distance_unit)})` : ""}`),
    ...objs("custom_locations").map(
      (c) => `${c.name ?? c.address_string ?? (c.latitude != null ? `${c.latitude.toFixed(3)}, ${c.longitude?.toFixed(3)}` : "Harita noktası")}${c.radius ? ` (+${c.radius} ${unit(c.distance_unit)})` : ""}`
    ),
    ...["places", "zips", "medium_geo_areas", "neighborhoods", "subcities"].flatMap((k) => objs(k).map((z) => z.name ?? z.key)),
  ];
  const flex = (t?.flexible_spec ?? []) as Record<string, { name?: string }[]>[];
  const interests = flex.flatMap((f) => Object.values(f).flat().map((x) => x?.name).filter((x): x is string => !!x));
  const auto = (t?.targeting_automation as { advantage_audience?: number } | undefined)?.advantage_audience === 1;
  const ca = ((t?.custom_audiences as { name?: string; id: string }[] | undefined) ?? []).map((c) => c.name ?? c.id);
  const ex = ((t?.excluded_custom_audiences as { name?: string; id: string }[] | undefined) ?? []).map((c) => `hariç: ${c.name ?? c.id}`);
  const platforms = (t?.publisher_platforms as string[] | undefined) ?? [];
  return {
    locations: locs,
    age: auto && Array.isArray(t?.age_range) ? `${(t!.age_range as number[])[0]}-${(t!.age_range as number[])[1]} (öneri)` : `${t?.age_min ?? 18}-${t?.age_max ?? 65}`,
    gender: GENDER(t?.genders as number[] | undefined),
    interests,
    advantage: auto,
    audiences: [...ca, ...ex],
    placements: platforms.length ? `Elle: ${platforms.join(", ")}` : "Otomatik (Advantage+)",
  };
}

export async function campaignDetail(campaignMetaId: string): Promise<CampaignDetail> {
  const t = await token();
  const c = await gGet<{
    id: string;
    name: string;
    status: string;
    effective_status: string;
    objective: string;
    daily_budget?: string;
    lifetime_budget?: string;
    spend_cap?: string;
    bid_strategy?: string;
    account_id: string;
  }>(campaignMetaId, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,spend_cap,bid_strategy,account_id" }, t);
  const sets = await gGet<{ data: (SrcAdSet & { targeting?: Record<string, unknown> })[] }>(
    `${campaignMetaId}/adsets`,
    { fields: "id,name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal,destination_type,targeting", limit: "50" },
    t
  );
  const ads = await gGet<{
    data: {
      id: string;
      name: string;
      status: string;
      effective_status: string;
      adset_id: string;
      ad_review_feedback?: { global?: Record<string, string> };
      issues_info?: { error_message?: string; error_summary?: string }[];
      preview_shareable_link?: string;
      creative?: { thumbnail_url?: string; image_url?: string; body?: string; title?: string; call_to_action_type?: string; object_story_spec?: Record<string, unknown>; asset_feed_spec?: unknown };
    }[];
  }>(
    `${campaignMetaId}/ads`,
    {
      fields: "id,name,status,effective_status,adset_id,ad_review_feedback,issues_info,preview_shareable_link,creative{thumbnail_url,image_url,body,title,call_to_action_type,object_story_spec,asset_feed_spec}",
      limit: "100",
    },
    t
  );
  const money = (v?: string) => (positive(v) && Number(v) < 9e14 ? Number(v) / 100 : null);
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    effectiveStatus: c.effective_status,
    objective: c.objective,
    dailyBudget: money(c.daily_budget),
    lifetimeBudget: money(c.lifetime_budget),
    spendCap: money(c.spend_cap),
    bidStrategy: c.bid_strategy ?? null,
    accountId: c.account_id,
    managerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.account_id}&selected_campaign_ids=${c.id}`,
    adsets: sets.data
      .filter((s) => LIVE(s.effective_status))
      .map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        effectiveStatus: s.effective_status,
        dailyBudget: money(s.daily_budget),
        lifetimeBudget: money(s.lifetime_budget),
        startTime: s.start_time ?? null,
        endTime: s.end_time ?? null,
        optimization: s.optimization_goal ?? null,
        destination: s.destination_type ?? null,
        targeting: targetingSummary(s.targeting),
      })),
    ads: ads.data
      .filter((a) => LIVE(a.effective_status))
      .map((a) => {
        const spec = a.creative?.object_story_spec as Record<string, unknown> | undefined;
        return {
          id: a.id,
          name: a.name,
          adsetId: a.adset_id,
          status: a.status,
          effectiveStatus: a.effective_status,
          thumbnail: a.creative?.thumbnail_url ?? a.creative?.image_url ?? null,
          body: a.creative?.body ?? null,
          title: a.creative?.title ?? null,
          cta: a.creative?.call_to_action_type ?? null,
          previewUrl: a.preview_shareable_link ?? null,
          issues: [
            ...Object.values(a.ad_review_feedback?.global ?? {}),
            ...(a.issues_info ?? []).map((i) => i.error_message ?? i.error_summary ?? "").filter(Boolean),
          ],
          editable: !!spec && !!(spec.link_data || spec.video_data) && !a.creative?.asset_feed_spec,
        };
      }),
  };
}
