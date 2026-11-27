"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditShareCalendar, getShareAccess } from "@/lib/shareCalendar";
import { findSocialAccount, toMetaPost, validateForMeta } from "@/lib/metaPublish";
import { metaScheduleProblems } from "@/lib/metaScheduleRules";
import { assertClientInScope } from "@/lib/clientAccess";

async function requireEditor() {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Oturum bulunamadı.");
  if (!canEditShareCalendar(await getShareAccess(session.user))) {
    throw new Error("Paylaşımı Meta'da planlama yetkiniz yok.");
  }
  return session.user;
}

// Not: canlı derlemede sunucu eylemlerinden fırlatılan hataların metni tarayıcıya gizlenerek gider; kullanıcı gerçek
// nedeni (ör. "Instagram görselin oranını kabul etmedi") görebilsin diye hata, sonuç nesnesi olarak döndürülür.
export type MetaActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };
const failure = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "İşlem yapılamadı." });

const refresh = () => {
  revalidatePath("/paylasim-takvimi");
  revalidatePath("/panel/takvim");
};

/** "Meta'da planla": paylaşımı, takvimdeki gün ve saatte Instagram ve Facebook'ta otomatik yayınlanmak üzere planlar.
 * Yetki ve dosyalar şimdi doğrulanır (Instagram'a önceden yüklenip kontrol edilir); sorun varsa planlanmaz. */
export async function scheduleSharePostOnMeta(id: string): Promise<MetaActionResult<{ instagram: string | null; page: string }>> {
  try {
    return { ok: true, ...(await schedule(id)) };
  } catch (e) {
    return failure(e);
  }
}

async function schedule(id: string) {
  const user = await requireEditor();
  const post = await prisma.sharePost.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } } } });
  if (!post) throw new Error("Paylaşım bulunamadı.");
  await assertClientInScope(user, post.clientId);
  if (post.publishedAt) throw new Error("Bu paylaşım zaten paylaşıldı olarak işaretli.");
  if (post.metaStatus === "SCHEDULED" || post.metaStatus === "PUBLISHING") throw new Error("Bu paylaşım zaten Meta'da planlı.");

  const account = await findSocialAccount(post.clientId);
  const problems = metaScheduleProblems({
    kind: post.kind,
    date: post.date,
    time: post.time,
    text: post.text,
    images: post.images.map((i) => ({ mediaType: i.mediaType === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const) })),
    // Yetki ayrıntısı (izin / "İçerik" görevi) aşağıda validateForMeta içinde Meta'ya sorularak denetlenir.
    metaAccess: account ? "OK" : "NO_ACCOUNT",
  });
  if (problems.length > 0) throw new Error(problems.join(" "));

  const target = await validateForMeta(toMetaPost(post), post.clientId);

  await prisma.sharePost.update({
    where: { id },
    data: {
      metaScheduled: true,
      metaStatus: "SCHEDULED",
      metaError: null,
      metaScheduledAt: new Date(),
      metaScheduledById: user.id,
      metaPublishedAt: null,
      igMediaId: null,
      igPermalink: null,
      fbPostId: null,
    },
  });
  refresh();
  return target;
}

/** "Planlamadan kaldır": saati gelince otomatik paylaşılmaz; paylaşım yeniden düzenlenebilir.
 * Eski, Meta Business Suite'te elle planlanmış kayıtlarda sadece işaret kalkar (oradaki plan elle kaldırılmalıdır). */
export async function unscheduleSharePostFromMeta(id: string): Promise<MetaActionResult<{ legacy: boolean }>> {
  try {
    return { ok: true, ...(await unschedule(id)) };
  } catch (e) {
    return failure(e);
  }
}

async function unschedule(id: string) {
  const user = await requireEditor();
  const post = await prisma.sharePost.findUnique({ where: { id }, select: { id: true, metaStatus: true, metaScheduled: true, clientId: true } });
  if (!post) throw new Error("Paylaşım bulunamadı.");
  await assertClientInScope(user, post.clientId);
  if (post.metaStatus === "PUBLISHING") throw new Error("Bu paylaşım şu an paylaşılıyor; artık durdurulamaz.");
  if (post.metaStatus === "PUBLISHED" || post.metaStatus === "PARTIAL") throw new Error("Bu paylaşım zaten yayınlandı.");

  // Yarış durumu: tam bu anda yayın başladıysa dokunma.
  const res = await prisma.sharePost.updateMany({
    where: { id, OR: [{ metaStatus: null }, { metaStatus: { in: ["SCHEDULED", "FAILED"] } }] },
    data: { metaScheduled: false, metaStatus: null, metaError: null, metaScheduledAt: null, metaScheduledById: null },
  });
  if (res.count !== 1) throw new Error("Paylaşım şu an paylaşılıyor; artık durdurulamaz.");
  refresh();
  return { legacy: post.metaStatus === null && post.metaScheduled };
}

export type BulkScheduleResult = { itemId: string; title: string; ok: boolean; message: string }[];

/** İçerik listesinden "Meta'da toplu planla": seçilen, müşterinin onayladığı satırlar kayıtlı paylaşım gün/saatleriyle
 * paylaşım takvimine eklenir ve Meta'da planlanır. Her satırın sonucu ayrı döner (biri hata verse diğerleri devam eder). */
export async function bulkScheduleContentOnMeta(itemIds: string[]): Promise<BulkScheduleResult> {
  const user = await requireEditor();
  const ids = [...new Set(itemIds)].slice(0, 60);
  const items = await prisma.contentItem.findMany({
    where: { id: { in: ids } },
    include: { client: { select: { name: true } }, deliveryFiles: { orderBy: { position: "asc" } } },
  });
  const out: BulkScheduleResult = [];
  for (const item of items) {
    try {
      await assertClientInScope(user, item.clientId);
      if (item.deliveryStatus !== "APPROVED") throw new Error("Müşteri henüz onaylamadı.");
      if (!item.shareDate || !item.shareTime) throw new Error("Paylaşım tarihi ve saati girilmemiş.");
      if (item.deliveryFiles.length === 0) throw new Error("Teslim görseli yok.");
      if (!(await findSocialAccount(item.clientId))) {
        throw new Error("Bu müşterinin Meta hesabı (Facebook sayfası / Instagram) sistemimize bağlı değil; otomatik planlanamaz.");
      }
      const kind = item.contentType === "STORY" ? "STORY" : item.contentType === "REELS" ? "REEL" : "POST";
      // Aynı satır daha önce takvime gönderildiyse (aynı gün + başlık) o paylaşım kullanılır; yoksa yenisi açılır.
      const existing = await prisma.sharePost.findFirst({
        where: { clientId: item.clientId, date: item.shareDate, title: item.title.slice(0, 120), publishedAt: null },
      });
      const post =
        existing ??
        (await prisma.sharePost.create({
          data: {
            date: item.shareDate,
            time: item.shareTime,
            kind,
            clientId: item.clientId,
            clientName: item.client.name,
            title: item.title.slice(0, 120),
            text: item.caption?.trim() || null,
            createdById: user.id,
            images: {
              create: item.deliveryFiles.map((f, position) => ({ url: f.url, name: f.name, position, mediaType: f.mediaType === "VIDEO" ? "VIDEO" : "IMAGE" })),
            },
          },
        }));
      if (existing && !(existing.metaStatus === "SCHEDULED" || existing.metaStatus === "PUBLISHING")) {
        await prisma.sharePost.update({ where: { id: existing.id }, data: { time: item.shareTime, text: item.caption?.trim() || existing.text, kind } });
      }
      if (post.metaStatus === "SCHEDULED" || post.metaStatus === "PUBLISHING") {
        out.push({ itemId: item.id, title: item.title, ok: true, message: "Zaten Meta'da planlı." });
        continue;
      }
      try {
        await schedule(post.id);
      } catch (e) {
        throw new Error(`Paylaşım takvimine eklendi ama Meta'da planlanamadı: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
      }
      out.push({ itemId: item.id, title: item.title, ok: true, message: `${item.shareDate} ${item.shareTime} için Meta'da planlandı.` });
    } catch (e) {
      out.push({ itemId: item.id, title: item.title, ok: false, message: e instanceof Error ? e.message : "Planlanamadı." });
    }
  }
  refresh();
  return out;
}
