import { prisma } from "@/lib/prisma";
import { getMetaToken } from "@/lib/meta";
import { fileIdFromUrl, publicMediaUrl } from "@/lib/publicMedia";
import { istanbulInstant, SHARE_KIND_LABEL } from "@/lib/shareTime";
import { istanbulToday } from "@/lib/clientPayments";
import { pushNotification } from "@/lib/inAppNotify";
import { shareRecipients } from "@/lib/shareCalendar";
import type { ShareKind } from "@prisma/client";

// Paylaşım Takvimi'ndeki bir paylaşımı Instagram ve Facebook'ta yayınlar.
// Instagram'ın API'sinde "ileri tarihe planla" yoktur; bu yüzden planlama bizim tarafta tutulur ve saati gelince
// (dakikada bir çalışan görev) buradan yayınlanır. Planlama anında dosyalar Instagram'a önceden doğrulatılır.

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MetaPublishError extends Error {}

type GraphError = { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string };

/** Meta'nın hata mesajını ekip için anlaşılır Türkçeye çevirir (bilinmeyenler olduğu gibi kalır). */
function explain(err: GraphError | undefined, status: number) {
  if (!err) return `Meta isteği başarısız (${status}).`;
  const raw = err.error_user_msg || err.message || `Meta isteği başarısız (${status}).`;
  if (err.code === 190) return "Meta erişim anahtarı geçersiz ya da süresi dolmuş (Ayarlar > Meta'dan yenileyin).";
  if (err.code === 10 || err.code === 200 || err.code === 3) {
    return `Yetki yok: Meta anahtarında paylaşım izni (instagram_content_publish / pages_manage_posts) ya da sistem kullanıcısının bu sayfada "İçerik" yetkisi eksik. (${raw})`;
  }
  if (err.error_subcode === 2207009 || /aspect ratio/i.test(raw)) {
    return `Instagram görselin en-boy oranını kabul etmedi (4:5 ile 1.91:1 arasında olmalı). (${raw})`;
  }
  if (err.error_subcode === 2207052 || err.code === 9004) return `Meta dosyayı sunucumuzdan indiremedi. (${raw})`;
  if (err.error_subcode === 2207026) return `Video biçimi desteklenmiyor (MP4 / MOV, H.264 olmalı). (${raw})`;
  if (err.error_subcode === 2207042 || err.code === 9) return `Instagram günlük paylaşım sınırına ulaşıldı. (${raw})`;
  return raw;
}

async function gFetch<T>(method: "GET" | "POST", path: string, params: Record<string, string>, token: string): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${GRAPH}/${path}?${body.toString()}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === "GET" ? { cache: "no-store" } : { method: "POST", body, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as (T & { error?: GraphError }) | null;
  if (!res.ok || !json || json.error) throw new MetaPublishError(explain(json?.error, res.status));
  return json;
}
const gGet = <T>(path: string, params: Record<string, string>, token: string) => gFetch<T>("GET", path, params, token);
const gPost = <T>(path: string, params: Record<string, string>, token: string) => gFetch<T>("POST", path, params, token);

// ---- Paylaşım verisi --------------------------------------------------------

type Media = { fileId: string; name: string | null; video: boolean };
export type MetaPost = {
  id: string;
  kind: ShareKind;
  text: string;
  media: Media[];
  coverFileId: string | null;
};
export type MetaTarget = { pageId: string; pageName: string; igId: string | null; igUsername: string | null; pageToken: string };

/** Müşterinin bağlı sayfası / Instagram hesabı (Sosyal Medya sayfasındaki eşleşme). */
export async function findSocialAccount(clientId: string | null) {
  if (!clientId) return null;
  return prisma.socialAccount.findFirst({ where: { clientId }, orderBy: { createdAt: "asc" } });
}

/** Paylaşımın dosyalarını Meta'ya verilebilir hâle getirir (hepsi Drive'da olmalı). */
export function toMetaPost(post: {
  id: string;
  kind: ShareKind;
  text: string | null;
  coverUrl: string | null;
  images: { url: string; name: string | null; mediaType: string }[];
}): MetaPost {
  const media = post.images.map((i) => {
    const fileId = fileIdFromUrl(i.url);
    if (!fileId) throw new MetaPublishError("Bu paylaşımın dosyaları Google Drive'da değil; otomatik paylaşım için dosyayı yeniden yükleyin.");
    return { fileId, name: i.name, video: i.mediaType === "VIDEO" };
  });
  for (const m of media) {
    if (m.video && /\.webm$/i.test(m.name ?? "")) throw new MetaPublishError("WEBM video Meta'da paylaşılamaz; MP4 ya da MOV yükleyin.");
  }
  return { id: post.id, kind: post.kind, text: post.text?.trim() ?? "", media, coverFileId: post.coverUrl ? fileIdFromUrl(post.coverUrl) : null };
}

/** Sayfa adına işlem yapmak için sayfa erişim anahtarı (sistem kullanıcısının sayfada "İçerik" yetkisi olmalı). */
export async function loadMetaTarget(clientId: string | null): Promise<MetaTarget> {
  const account = await findSocialAccount(clientId);
  if (!account) throw new MetaPublishError("Bu müşterinin Meta'da bağlı sayfası / Instagram hesabı yok.");
  const token = await getMetaToken();
  if (!token) throw new MetaPublishError("Meta erişim anahtarı tanımlı değil (Ayarlar > Meta).");
  const page = await gGet<{ access_token?: string }>(account.pageId, { fields: "access_token" }, token);
  if (!page.access_token) {
    throw new MetaPublishError(`"${account.pageName}" sayfası için paylaşım yetkisi alınamadı. Meta Business'ta sistem kullanıcısına bu sayfada "İçerik" yetkisi verin ve anahtarı yeni izinlerle yenileyin.`);
  }
  return { pageId: account.pageId, pageName: account.pageName, igId: account.igId, igUsername: account.igUsername, pageToken: page.access_token };
}

const imageUrl = (m: Media) => publicMediaUrl(m.fileId, "j");
const videoUrl = (m: Media) => publicMediaUrl(m.fileId, "o", m.name ?? "video.mp4");

// ---- Instagram --------------------------------------------------------------

/** Kapsayıcı (container) hazır olana kadar bekler. Süre dolarsa "IN_PROGRESS" döner; hata varsa fırlatır. */
async function igWait(containerId: string, token: string, maxMs: number): Promise<"FINISHED" | "IN_PROGRESS"> {
  const until = Date.now() + maxMs;
  for (;;) {
    const s = await gGet<{ status_code?: string; status?: string }>(containerId, { fields: "status_code,status" }, token);
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return "FINISHED";
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new MetaPublishError(`Instagram dosyayı işleyemedi: ${s.status ?? s.status_code}`);
    }
    if (Date.now() >= until) return "IN_PROGRESS";
    await sleep(5000);
  }
}

/** Yayına hazır Instagram kapsayıcılarını oluşturur (yayınlamaz). Story'de her dosya ayrı bir story'dir. */
async function igPrepare(post: MetaPost, t: MetaTarget, waitMs: number, validateOnly = false): Promise<string[]> {
  const ig = t.igId as string;
  const create = (params: Record<string, string>) => gPost<{ id: string }>(`${ig}/media`, params, t.pageToken).then((r) => r.id);
  const ready = async (id: string) => {
    await igWait(id, t.pageToken, waitMs);
    return id;
  };

  if (post.kind === "STORY") {
    const ids: string[] = [];
    for (const m of post.media) {
      ids.push(await ready(await create(m.video ? { media_type: "STORIES", video_url: videoUrl(m) } : { media_type: "STORIES", image_url: imageUrl(m) })));
    }
    return ids;
  }

  const first = post.media[0];
  // Reels ve tek videolu post: Instagram'da ikisi de Reels olarak yayınlanır.
  if (post.kind === "REEL" || (post.media.length === 1 && first.video)) {
    const params: Record<string, string> = { media_type: "REELS", video_url: videoUrl(first), caption: post.text, share_to_feed: "true" };
    if (post.coverFileId) params.cover_url = publicMediaUrl(post.coverFileId, "j");
    return [await ready(await create(params))];
  }

  if (post.media.length === 1) return [await ready(await create({ image_url: imageUrl(first), caption: post.text }))];

  // Kaydırmalı: önce her dosya, sonra hepsini toplayan kapsayıcı.
  const children: string[] = [];
  for (const m of post.media) {
    children.push(
      await ready(
        await create(m.video ? { media_type: "VIDEO", video_url: videoUrl(m), is_carousel_item: "true" } : { image_url: imageUrl(m), is_carousel_item: "true" })
      )
    );
  }
  // Doğrulamada dosyaların tek tek kabul edilmesi yeterli (işlenmesi süren video varken toplayıcı oluşturulamaz).
  if (validateOnly) return children;
  return [await ready(await create({ media_type: "CAROUSEL", children: children.join(","), caption: post.text }))];
}

async function igPublish(post: MetaPost, t: MetaTarget) {
  const ig = t.igId as string;
  // Videoların işlenmesi birkaç dakika sürebilir.
  const containers = await igPrepare(post, t, 6 * 60 * 1000);
  let mediaId = "";
  for (const id of containers) {
    const state = await igWait(id, t.pageToken, 60 * 1000);
    if (state !== "FINISHED") throw new MetaPublishError("Instagram videoyu zamanında işleyemedi.");
    mediaId = (await gPost<{ id: string }>(`${ig}/media_publish`, { creation_id: id }, t.pageToken)).id;
  }
  const info = await gGet<{ permalink?: string }>(mediaId, { fields: "permalink" }, t.pageToken).catch(() => ({ permalink: undefined }));
  return { id: mediaId, permalink: info.permalink ?? null };
}

// ---- Facebook sayfası -------------------------------------------------------

/** Reels ve video story: 3 adımlı yükleme (başlat, dosya adresini ver, bitir). */
async function fbUploadVideo(edge: "video_reels" | "video_stories", m: Media, t: MetaTarget, finish: Record<string, string>) {
  const start = await gPost<{ video_id: string; upload_url: string }>(`${t.pageId}/${edge}`, { upload_phase: "start" }, t.pageToken);
  const up = await fetch(start.upload_url, {
    method: "POST",
    headers: { Authorization: `OAuth ${t.pageToken}`, file_url: videoUrl(m) },
    cache: "no-store",
  });
  const upJson = (await up.json().catch(() => null)) as { success?: boolean; error?: GraphError } | null;
  if (!up.ok || !upJson?.success) throw new MetaPublishError(`Facebook videoyu alamadı: ${explain(upJson?.error, up.status)}`);
  await gPost(`${t.pageId}/${edge}`, { upload_phase: "finish", video_id: start.video_id, ...finish }, t.pageToken);
  return start.video_id;
}

const fbUnpublishedPhoto = (m: Media, t: MetaTarget) =>
  gPost<{ id: string }>(`${t.pageId}/photos`, { url: imageUrl(m), published: "false" }, t.pageToken).then((r) => r.id);

async function fbPublish(post: MetaPost, t: MetaTarget): Promise<{ id: string; warning: string | null }> {
  if (post.kind === "STORY") {
    let last = "";
    for (const m of post.media) {
      if (m.video) last = await fbUploadVideo("video_stories", m, t, {});
      else {
        const photoId = await fbUnpublishedPhoto(m, t);
        last = (await gPost<{ post_id?: string }>(`${t.pageId}/photo_stories`, { photo_id: photoId }, t.pageToken)).post_id ?? photoId;
      }
    }
    return { id: last, warning: null };
  }

  const first = post.media[0];
  if (post.kind === "REEL") {
    const id = await fbUploadVideo("video_reels", first, t, { video_state: "PUBLISHED", description: post.text });
    return { id, warning: null };
  }
  if (post.media.length === 1 && first.video) {
    const r = await gPost<{ id: string }>(`${t.pageId}/videos`, { file_url: videoUrl(first), description: post.text }, t.pageToken);
    return { id: r.id, warning: null };
  }
  if (post.media.length === 1) {
    const r = await gPost<{ id: string; post_id?: string }>(`${t.pageId}/photos`, { url: imageUrl(first), caption: post.text }, t.pageToken);
    return { id: r.post_id ?? r.id, warning: null };
  }

  // Çoklu görsel: Facebook gönderisinde sadece görseller olabilir (videolar Instagram'daki kaydırmalıda kalır).
  const photos = post.media.filter((m) => !m.video);
  if (photos.length === 0) {
    const r = await gPost<{ id: string }>(`${t.pageId}/videos`, { file_url: videoUrl(first), description: post.text }, t.pageToken);
    return { id: r.id, warning: "Facebook'ta sadece ilk video paylaşıldı (çoklu video gönderisi desteklenmiyor)." };
  }
  const ids: string[] = [];
  for (const m of photos) ids.push(await fbUnpublishedPhoto(m, t));
  const params: Record<string, string> = { message: post.text };
  ids.forEach((id, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  const r = await gPost<{ id: string }>(`${t.pageId}/feed`, params, t.pageToken);
  return { id: r.id, warning: photos.length < post.media.length ? "Facebook gönderisine videolar eklenmedi (sadece görseller)." : null };
}

// ---- Hangi hesapta paylaşım yapabiliyoruz -----------------------------------

let lastAccessRefresh = 0;

/** Her bağlı hesap için "paylaşım yapabiliyor muyuz" bilgisini Meta'dan okuyup kaydeder (anahtardaki izinler + sayfadaki
 * "İçerik" yetkisi). Takvim bunu kullanarak yetkisi olmayan müşterilerde "Meta'da planla"yı kapatır. En fazla 10 dakikada bir çalışır. */
export async function refreshPublishAccess(force = false) {
  if (!force && Date.now() - lastAccessRefresh < 10 * 60 * 1000) return;
  lastAccessRefresh = Date.now();

  const accounts = await prisma.socialAccount.findMany({ select: { id: true, pageId: true, igId: true, canPublish: true } });
  if (accounts.length === 0) return;
  const token = await getMetaToken();
  let granted = new Set<string>();
  let tasksOf = new Map<string, string[]>();
  if (token) {
    const [perms, pages] = await Promise.all([
      gGet<{ data: { permission: string; status: string }[] }>("me/permissions", {}, token),
      gGet<{ data: { id: string; tasks?: string[] }[] }>("me/accounts", { fields: "id,tasks", limit: "200" }, token),
    ]);
    granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
    tasksOf = new Map(pages.data.map((p) => [p.id, p.tasks ?? []]));
  }
  for (const a of accounts) {
    const tasks = tasksOf.get(a.pageId) ?? [];
    const can =
      granted.has("pages_manage_posts") &&
      (!a.igId || granted.has("instagram_content_publish")) &&
      tasks.some((t) => t === "CREATE_CONTENT" || t === "MANAGE");
    if (can !== a.canPublish) await prisma.socialAccount.update({ where: { id: a.id }, data: { canPublish: can } });
  }
}

// ---- Planlama anında doğrulama ---------------------------------------------

/** Anahtarın paylaşım izinlerini ve sistem kullanıcısının sayfadaki "İçerik" yetkisini denetler; eksikse ne yapılacağını söyler. */
async function assertPublishAccess(clientId: string | null) {
  const account = await findSocialAccount(clientId);
  if (!account) throw new MetaPublishError("Bu müşterinin Meta'da bağlı sayfası / Instagram hesabı yok.");
  const token = await getMetaToken();
  if (!token) throw new MetaPublishError("Meta erişim anahtarı tanımlı değil (Reklam Paneli > Meta bağlantısı).");

  const perms = await gGet<{ data: { permission: string; status: string }[] }>("me/permissions", {}, token);
  const granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
  const missing = ["pages_manage_posts", ...(account.igId ? ["instagram_content_publish"] : [])].filter((p) => !granted.has(p));
  if (missing.length > 0) {
    throw new MetaPublishError(
      `Meta anahtarında paylaşım izni yok (${missing.join(", ")}). Meta Business > Sistem kullanıcıları > "Jeton oluştur" ile bu izinleri de seçerek yeni anahtar üretin ve Reklam Paneli > Meta bağlantısı bölümüne yapıştırın.`
    );
  }

  const pages = await gGet<{ data: { id: string; tasks?: string[] }[] }>("me/accounts", { fields: "id,tasks", limit: "200" }, token);
  const page = pages.data.find((p) => p.id === account.pageId);
  if (!page) throw new MetaPublishError(`"${account.pageName}" sayfası sistem kullanıcısına atanmamış görünüyor.`);
  if (!(page.tasks ?? []).some((t) => t === "CREATE_CONTENT" || t === "MANAGE")) {
    throw new MetaPublishError(
      `"${account.pageName}" sayfasında sistem kullanıcısının "İçerik" yetkisi yok. Meta Business > Sistem kullanıcıları > PanelReadOnly > bu sayfa > Yönet > "İçerik" seçeneğini açın.`
    );
  }
}

/** "Meta'da planla" basıldığında: yetkiyi ve dosyaları şimdiden sınar ki sorun paylaşım saatinde değil, hemen görülsün.
 * Instagram'da dosyalar gerçekten yüklenip doğrulanır (yayınlanmaz; kullanılmayan kapsayıcılar 24 saatte kendiliğinden silinir). */
export async function validateForMeta(post: MetaPost, clientId: string | null) {
  await assertPublishAccess(clientId);
  const target = await loadMetaTarget(clientId);
  if (target.igId) {
    try {
      // Videolarda işlem uzun sürebilir: 40 sn içinde hata çıkmazsa kabul edilir (istek zaman aşımına uğramasın).
      await igPrepare(post, target, 40 * 1000, true);
    } catch (e) {
      throw new MetaPublishError(`Instagram: ${e instanceof Error ? e.message : "doğrulanamadı"}`);
    }
  }
  return { instagram: target.igUsername, page: target.pageName };
}

// ---- Yayın ------------------------------------------------------------------

const msgOf = (e: unknown) => (e instanceof Error ? e.message : "Bilinmeyen hata");

/** Bildirim: adminler ve o müşteriden sorumlu, takvim yetkisi olan ekip üyeleri. */
async function notifyTeam(title: string, message: string, post: { date: string; clientId: string | null }) {
  const [y, m] = post.date.split("-").map(Number);
  const people = await shareRecipients(post.clientId);
  await Promise.all(
    people.map((u) => pushNotification({ userId: u.id, type: "SHARE_REMINDER", title, message, url: `/paylasim-takvimi?year=${y}&month=${m}` }))
  );
}

/** Tek bir paylaşımı şimdi Instagram ve Facebook'ta yayınlar ve sonucu kaydeder. */
async function publishOne(id: string, now: Date) {
  const row = await prisma.sharePost.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } } } });
  if (!row) return;
  const label = `${row.clientName}: ${SHARE_KIND_LABEL[row.kind]}${row.title ? ` — ${row.title}` : ""}`;

  const fail = async (error: string) => {
    await prisma.sharePost.update({ where: { id }, data: { metaStatus: "FAILED", metaScheduled: false, metaError: error.slice(0, 900) } });
    await notifyTeam("Otomatik paylaşım yapılamadı", `${label} · ${error}`.slice(0, 480), row);
  };

  let post: MetaPost;
  let target: MetaTarget;
  try {
    post = toMetaPost(row);
    target = await loadMetaTarget(row.clientId);
  } catch (e) {
    return fail(msgOf(e));
  }

  const notes: string[] = [];
  let ig: { id: string; permalink: string | null } | null = null;
  let fb: { id: string } | null = null;
  let igFailed = false;
  let fbFailed = false;

  if (target.igId) {
    try {
      ig = await igPublish(post, target);
    } catch (e) {
      igFailed = true;
      notes.push(`Instagram: ${msgOf(e)}`);
    }
  } else {
    notes.push("Bu sayfaya bağlı Instagram hesabı yok; sadece Facebook'ta paylaşıldı.");
  }
  try {
    const r = await fbPublish(post, target);
    fb = { id: r.id };
    if (r.warning) notes.push(r.warning);
  } catch (e) {
    fbFailed = true;
    notes.push(`Facebook: ${msgOf(e)}`);
  }

  if (!ig && !fb) return fail(notes.join(" | "));

  const partial = igFailed || fbFailed;
  await prisma.sharePost.update({
    where: { id },
    data: {
      metaStatus: partial ? "PARTIAL" : "PUBLISHED",
      metaError: notes.length > 0 ? notes.join(" | ").slice(0, 900) : null,
      metaPublishedAt: now,
      publishedAt: now,
      igMediaId: ig?.id ?? null,
      igPermalink: ig?.permalink ?? null,
      fbPostId: fb?.id ?? null,
    },
  });
  const where = [ig ? "Instagram" : null, fb ? "Facebook" : null].filter(Boolean).join(" ve ");
  await notifyTeam(
    partial ? "Paylaşım kısmen yapıldı" : "Paylaşım otomatik yapıldı",
    partial ? `${label} · ${where}'ta paylaşıldı. ${notes.join(" | ")}`.slice(0, 480) : `${label} · ${where}'ta paylaşıldı.`,
    row
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Planlanan saat bundan fazla kaçırıldıysa (sunucu kapalıydı) paylaşım yapılmaz, ekip uyarılır. */
const MAX_LATE_MS = 90 * 60 * 1000;
/** Bu kadar süredir "paylaşılıyor"da kalan kayıt yarıda kalmış sayılır (çift paylaşım olmasın diye yeniden denenmez). */
const STUCK_MS = 30 * 60 * 1000;

let running = false;

/** Dakikada bir çalışır: saati gelen planlı paylaşımları yayınlar. */
export async function runMetaPublishJobs(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const stuck = await prisma.sharePost.findMany({
      where: { metaStatus: "PUBLISHING", updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
      select: { id: true, date: true, clientId: true, clientName: true, title: true },
    });
    for (const p of stuck) {
      const error = "Paylaşım yarıda kesildi (sunucu yeniden başlamış olabilir). Instagram ve Facebook'u kontrol edip gerekirse elle paylaşın.";
      await prisma.sharePost.update({ where: { id: p.id }, data: { metaStatus: "FAILED", metaScheduled: false, metaError: error } });
      await notifyTeam("Otomatik paylaşım yarıda kaldı", `${p.clientName}${p.title ? ` — ${p.title}` : ""} · ${error}`.slice(0, 480), p);
    }

    const today = istanbulToday(now);
    const todayIso = `${today.year}-${pad(today.month)}-${pad(today.day)}`;
    const candidates = await prisma.sharePost.findMany({
      where: { metaStatus: "SCHEDULED", publishedAt: null, time: { not: null }, date: { lte: todayIso } },
      select: { id: true, date: true, time: true, clientId: true, clientName: true, title: true },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });
    for (const p of candidates) {
      const due = istanbulInstant(p.date, p.time as string).getTime();
      if (due > now.getTime()) continue;
      // Sahiplen: aynı paylaşım iki kez yayınlanmasın.
      const claimed = await prisma.sharePost.updateMany({ where: { id: p.id, metaStatus: "SCHEDULED" }, data: { metaStatus: "PUBLISHING" } });
      if (claimed.count !== 1) continue;
      if (now.getTime() - due > MAX_LATE_MS) {
        const error = "Planlanan saat kaçırıldı (sunucu o sırada çalışmıyordu); otomatik paylaşılmadı.";
        await prisma.sharePost.update({ where: { id: p.id }, data: { metaStatus: "FAILED", metaScheduled: false, metaError: error } });
        await notifyTeam("Otomatik paylaşım yapılamadı", `${p.clientName}${p.title ? ` — ${p.title}` : ""} · ${error}`, p);
        continue;
      }
      try {
        await publishOne(p.id, new Date());
      } catch (e) {
        await prisma.sharePost
          .update({ where: { id: p.id }, data: { metaStatus: "FAILED", metaScheduled: false, metaError: msgOf(e).slice(0, 900) } })
          .catch(() => {});
      }
    }
  } finally {
    running = false;
  }
}
