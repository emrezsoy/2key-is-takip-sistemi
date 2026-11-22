"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { MetaError, clearMetaToken, graphGet, storeMetaToken } from "@/lib/meta";
import { refreshPublishAccess } from "@/lib/metaPublish";
import { syncAds } from "@/lib/adsSync";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    throw new Error("Bu işlem sadece yöneticiler içindir.");
  }
  return session.user;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Bilinmeyen hata.");

/** Meta erişim anahtarını doğrular, şifreli kaydeder ve ilk verileri (son 1 yıl) çeker. */
export async function connectMeta(token: string) {
  await requireAdmin();
  const clean = token.trim();
  if (clean.length < 20) throw new Error("Anahtar geçersiz görünüyor.");

  try {
    await graphGet<{ id: string }>("me", { fields: "id,name" }, clean);
  } catch (e) {
    throw new Error(`Meta anahtarı doğrulanamadı: ${errText(e)}`);
  }
  await storeMetaToken(clean);
  // Yeni anahtarın paylaşım izinleri hemen yansısın (Paylaşım Takvimi'ndeki "Meta'da planla").
  await refreshPublishAccess(true).catch(() => {});
  revalidatePath("/paylasim-takvimi");

  try {
    const result = await syncAds(365);
    revalidatePath("/reklam-paneli");
    return result;
  } catch (e) {
    revalidatePath("/reklam-paneli");
    throw new Error(`Anahtar kaydedildi ama veriler çekilemedi: ${errText(e)}`);
  }
}

export async function disconnectMeta() {
  await requireAdmin();
  await clearMetaToken();
  revalidatePath("/reklam-paneli");
}

/** Son 40 günün verisini Meta'dan yeniden çeker. */
export async function syncAdsNow() {
  await requireAdmin();
  try {
    const result = await syncAds(40);
    revalidatePath("/reklam-paneli");
    return result;
  } catch (e) {
    throw new Error(e instanceof MetaError ? `Meta: ${e.message}` : errText(e));
  }
}

/** Reklam hesabını bir müşteriye bağlar (null = bağlantıyı kaldır). */
export async function setAdAccountClient(adAccountId: string, clientId: string | null) {
  await requireAdmin();
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new Error("Müşteri bulunamadı.");
  }
  await prisma.adAccount.update({ where: { id: adAccountId }, data: { clientId } });
  revalidatePath("/reklam-paneli");
}
