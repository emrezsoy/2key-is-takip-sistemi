"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { canManageAds, canViewAdPanel, requireManageableAccount } from "@/lib/adsAccess";
import { getClientScope, inClientScope } from "@/lib/clientAccess";
import {
  addAdToAdSet,
  adSetObjective,
  campaignDetail,
  composerAssets,
  copyCampaign,
  createCampaignFull,
  createEngagementAudience,
  createLeadForm,
  createLookalike,
  duplicateAdSet,
  existingPosts,
  getAdSetEdit,
  getAdText,
  objectAccountId,
  previewAd,
  removeObject,
  searchDetailed,
  searchLocales,
  searchLocations,
  setObjectStatus,
  updateAdSet,
  updateAdText,
  updateCampaign,
  uploadMedia,
  type AdSetEdit,
  type AdTextEdit,
  type LeadFormInput,
} from "@/lib/metaAds";
import type {
  AdActionResult,
  AdDraft,
  AudienceDraft,
  CampaignDetail,
  CampaignDraft,
  ComposerContext,
  CopySpec,
  ExistingPost,
  LocaleRef,
  LocationPick,
  MessageDestination,
  ObjectiveKey,
  UploadedMedia,
} from "@/lib/adsTypes";

// Canlıda sunucu eyleminden fırlatılan hatanın metni tarayıcıya gizlenir; Meta'nın gerçek nedeni görünsün diye
// hatalar sonuç nesnesi olarak döner.
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "İşlem yapılamadı." });

async function sessionUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Oturum bulunamadı.");
  return session.user;
}

async function requireManager() {
  const user = await sessionUser();
  if (!(await canManageAds(user))) throw new Error("Reklam yönetme yetkiniz yok.");
  return user;
}

/** Kampanya / reklam seti / reklam kimliğinden hesabı bulur ve yönetim yetkisini doğrular. */
async function requireObject(user: SessionUser, objectId: string) {
  const row = await prisma.adCampaign.findUnique({ where: { metaId: objectId }, select: { adAccount: { select: { metaId: true } } } });
  const accountMetaId = row?.adAccount.metaId ?? (await objectAccountId(objectId));
  return requireManageableAccount(user, accountMetaId);
}

const refresh = () => revalidatePath("/reklam-paneli");

// ---- Arama ------------------------------------------------------------------------------

export async function searchAdLocations(q: string): Promise<AdActionResult<{ items: LocationPick[] }>> {
  try {
    await requireManager();
    return { ok: true, items: q.trim().length < 2 ? [] : await searchLocations(q.trim()) };
  } catch (e) {
    return fail(e);
  }
}

export async function searchAdDetailed(
  accountMetaId: string,
  q: string
): Promise<AdActionResult<{ items: { id: string; name: string; type: string; size: number | null; path: string }[] }>> {
  try {
    const user = await requireManager();
    await requireManageableAccount(user, accountMetaId);
    return { ok: true, items: q.trim().length < 2 ? [] : await searchDetailed(accountMetaId, q.trim()) };
  } catch (e) {
    return fail(e);
  }
}

export async function searchAdLocales(q: string): Promise<AdActionResult<{ items: LocaleRef[] }>> {
  try {
    await requireManager();
    return { ok: true, items: q.trim().length < 2 ? [] : await searchLocales(q.trim()) };
  } catch (e) {
    return fail(e);
  }
}

// ---- Kampanya penceresi ------------------------------------------------------------------

/** Müşterinin sayfası / Instagram'ı, Paylaşım Takvimi medyası, pixel'ler, özel kitleler ve formlar. */
export async function getComposerData(accountMetaId: string): Promise<AdActionResult<{ ctx: ComposerContext }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, accountMetaId);
    const social = account.clientId ? await prisma.socialAccount.findFirst({ where: { clientId: account.clientId }, orderBy: { createdAt: "asc" } }) : null;
    const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const posts = account.clientId
      ? await prisma.sharePost.findMany({
          where: { clientId: account.clientId, date: { gte: since } },
          include: { images: { orderBy: { position: "asc" } } },
          orderBy: { date: "desc" },
          take: 60,
        })
      : [];
    const media: ComposerContext["media"] = [];
    for (const p of posts) {
      for (const i of p.images) {
        if (!i.url.startsWith("/api/files/")) continue; // sadece Drive'daki dosyalar Meta'ya aktarılabilir
        media.push({ url: i.url, name: i.name ?? "dosya", type: i.mediaType === "VIDEO" ? "VIDEO" : "IMAGE", date: p.date, title: p.title, text: p.text });
      }
    }
    const assets = await composerAssets(account.metaId, account.clientId);
    return { ok: true, ctx: { page: social?.pageName ?? null, instagram: social?.igUsername ?? null, media: media.slice(0, 80), ...assets } };
  } catch (e) {
    return fail(e);
  }
}

export async function getExistingPosts(accountMetaId: string): Promise<AdActionResult<{ posts: ExistingPost[] }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, accountMetaId);
    return { ok: true, posts: await existingPosts(account.clientId) };
  } catch (e) {
    return fail(e);
  }
}

/** Görsel / videoyu reklam hesabına yükler. Form: "account" + "media" (dosya) ya da "mediaUrl" (Paylaşım Takvimi). */
export async function uploadAdMedia(formData: FormData): Promise<AdActionResult<{ media: UploadedMedia }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, String(formData.get("account") ?? ""));
    const file = formData.get("media");
    const mediaUrl = String(formData.get("mediaUrl") ?? "");
    if (file instanceof File && file.size > 0) {
      if (file.size > 300 * 1024 * 1024) throw new Error("Dosya en fazla 300 MB olabilir.");
      const media = await uploadMedia(account.metaId, { kind: "upload", name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
      return { ok: true, media };
    }
    if (!mediaUrl) throw new Error("Dosya seçin.");
    return { ok: true, media: await uploadMedia(account.metaId, { kind: "stored", url: mediaUrl }) };
  } catch (e) {
    return fail(e);
  }
}

export async function previewAdCreative(
  accountMetaId: string,
  ctx: { objective: ObjectiveKey; destination: MessageDestination },
  ad: AdDraft,
  format: string
): Promise<AdActionResult<{ html: string }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, accountMetaId);
    return { ok: true, html: await previewAd(account.metaId, account.clientId, ctx, ad, format) };
  } catch (e) {
    return fail(e);
  }
}

export async function createAdCampaign(
  accountMetaId: string,
  draft: CampaignDraft
): Promise<AdActionResult<{ campaignId: string; activated: boolean; warnings: string[] }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, accountMetaId);
    const res = await createCampaignFull(account.metaId, account.clientId, draft);
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

export async function createAdAudience(
  accountMetaId: string,
  input: { kind: "ig" | "page" | "lookalike"; days: number; sourceId: string; ratio: number; name: string }
): Promise<AdActionResult<{ id: string; name: string }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, accountMetaId);
    const name = input.name.trim() || (input.kind === "lookalike" ? `Benzer kitle %${input.ratio}` : `${input.kind === "ig" ? "Instagram" : "Facebook"} etkileşim ${input.days} gün`);
    const r =
      input.kind === "lookalike"
        ? await createLookalike(account.metaId, input.sourceId, input.ratio, name)
        : await createEngagementAudience(account.metaId, account.clientId, input.kind, input.days, name);
    return { ok: true, id: r.id, name };
  } catch (e) {
    return fail(e);
  }
}

export async function createAdLeadForm(accountMetaId: string, input: LeadFormInput): Promise<AdActionResult<{ id: string; name: string }>> {
  try {
    const user = await requireManager();
    const account = await requireManageableAccount(user, accountMetaId);
    const r = await createLeadForm(account.clientId, input);
    return { ok: true, id: r.id, name: input.name.trim() || "Form" };
  } catch (e) {
    return fail(e);
  }
}

// ---- Yönetim ----------------------------------------------------------------------------

export async function copyAdCampaign(campaignMetaId: string, spec: CopySpec): Promise<AdActionResult<{ campaignId: string; skipped: string[]; activated: boolean }>> {
  try {
    const user = await requireManager();
    await requireObject(user, campaignMetaId);
    const res = await copyCampaign(campaignMetaId, spec);
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

export async function setAdObjectStatus(objectId: string, level: "campaign" | "adset" | "ad", status: "ACTIVE" | "PAUSED"): Promise<AdActionResult> {
  try {
    const user = await requireManager();
    await requireObject(user, objectId);
    await setObjectStatus(objectId, status, level);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Eski sürümle uyum: kampanya durumunu değiştirir. */
export async function setAdCampaignStatus(campaignMetaId: string, status: "ACTIVE" | "PAUSED"): Promise<AdActionResult> {
  return setAdObjectStatus(campaignMetaId, "campaign", status);
}

export async function removeAdObject(objectId: string, mode: "delete" | "archive"): Promise<AdActionResult> {
  try {
    const user = await requireManager();
    await requireObject(user, objectId);
    await removeObject(objectId, mode);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateAdCampaign(
  campaignMetaId: string,
  input: { dailyBudget?: number | null; endTime?: string | null; name?: string; spendCap?: number | null }
): Promise<AdActionResult> {
  try {
    const user = await requireManager();
    await requireObject(user, campaignMetaId);
    await updateCampaign(campaignMetaId, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function getAdSetForEdit(adsetId: string): Promise<AdActionResult<{ edit: AdSetEdit; accountId: string }>> {
  try {
    const user = await requireManager();
    const account = await requireObject(user, adsetId);
    return { ok: true, edit: await getAdSetEdit(adsetId), accountId: account.metaId };
  } catch (e) {
    return fail(e);
  }
}

export async function updateAdSetAction(
  adsetId: string,
  input: { name?: string; budget?: number | null; endTime?: string | null; audience?: AudienceDraft }
): Promise<AdActionResult> {
  try {
    const user = await requireManager();
    await requireObject(user, adsetId);
    await updateAdSet(adsetId, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateAdSetAction(adsetId: string, name: string): Promise<AdActionResult<{ adsetId: string; skipped: string[] }>> {
  try {
    const user = await requireManager();
    await requireObject(user, adsetId);
    const r = await duplicateAdSet(adsetId, name);
    refresh();
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function getAdSetContext(adsetId: string): Promise<AdActionResult<{ objective: ObjectiveKey; destination: MessageDestination; accountId: string }>> {
  try {
    const user = await requireManager();
    const account = await requireObject(user, adsetId);
    return { ok: true, ...(await adSetObjective(adsetId)), accountId: account.metaId };
  } catch (e) {
    return fail(e);
  }
}

export async function addAdAction(adsetId: string, ad: AdDraft): Promise<AdActionResult<{ adId: string }>> {
  try {
    const user = await requireManager();
    const account = await requireObject(user, adsetId);
    const adId = await addAdToAdSet(adsetId, account.clientId, ad);
    refresh();
    return { ok: true, adId };
  } catch (e) {
    return fail(e);
  }
}

export async function getAdTextAction(adId: string): Promise<AdActionResult<{ edit: AdTextEdit }>> {
  try {
    const user = await requireManager();
    await requireObject(user, adId);
    return { ok: true, edit: await getAdText(adId) };
  } catch (e) {
    return fail(e);
  }
}

export async function updateAdTextAction(
  adId: string,
  input: { text: string; headline: string; description: string; link: string; cta: string | null }
): Promise<AdActionResult> {
  try {
    const user = await requireManager();
    await requireObject(user, adId);
    await updateAdText(adId, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Kampanya ayrıntısı: Reklam Paneli'ni görebilen herkes (sorumlu olduğu müşterilerde). */
export async function getAdCampaignDetail(campaignMetaId: string): Promise<AdActionResult<{ detail: CampaignDetail }>> {
  try {
    const user = await sessionUser();
    if (!(await canViewAdPanel(user))) throw new Error("Reklam Paneli yetkiniz yok.");
    const row = await prisma.adCampaign.findUnique({ where: { metaId: campaignMetaId }, select: { adAccount: { select: { clientId: true } } } });
    if (!row) throw new Error("Kampanya bulunamadı.");
    if (!inClientScope(await getClientScope(user), row.adAccount.clientId)) throw new Error("Bu kampanyayı görme yetkiniz yok.");
    return { ok: true, detail: await campaignDetail(campaignMetaId) };
  } catch (e) {
    return fail(e);
  }
}
