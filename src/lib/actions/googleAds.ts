"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import {
  GoogleAdsError,
  buildAuthUrl,
  clearGoogleConnection,
  digits,
  saveGoogleOAuthConfig,
  syncGoogleAds,
} from "@/lib/googleAds";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) throw new Error("Bu işlem sadece yöneticiler içindir.");
  return session.user;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Bilinmeyen hata.");

/** OAuth istemci bilgilerini (şifreli) kaydedip Google yetkilendirme adresini döner. */
export async function startGoogleAuth(input: { clientId: string; clientSecret: string; managerId: string }) {
  await requireAdmin();
  const clientId = input.clientId.trim();
  const secret = input.clientSecret.trim();
  if (digits(input.managerId).length < 8) throw new Error("Yönetici hesap numarası geçersiz.");
  if (!clientId.endsWith(".apps.googleusercontent.com")) throw new Error("İstemci kimliği geçersiz görünüyor.");
  if (secret.length < 10) throw new Error("İstemci sırrı geçersiz görünüyor.");

  await saveGoogleOAuthConfig(clientId, secret, input.managerId);
  const state = crypto.randomBytes(16).toString("hex");
  (await cookies()).set("g_ads_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return buildAuthUrl(state);
}

/** Bağlıyken yeniden yetkilendirme gerekirse (kayıtlı istemci bilgisiyle). */
export async function restartGoogleAuth() {
  await requireAdmin();
  const state = crypto.randomBytes(16).toString("hex");
  (await cookies()).set("g_ads_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return buildAuthUrl(state);
}

export async function syncGoogleNow() {
  await requireAdmin();
  try {
    const r = await syncGoogleAds(40);
    revalidatePath("/reklam-paneli");
    return r;
  } catch (e) {
    throw new Error(e instanceof GoogleAdsError ? e.message : errText(e));
  }
}

export async function disconnectGoogle() {
  await requireAdmin();
  await clearGoogleConnection();
  revalidatePath("/reklam-paneli");
}

export async function setGoogleAccountClient(adAccountId: string, clientId: string | null) {
  await requireAdmin();
  if (clientId) {
    const c = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!c) throw new Error("Müşteri bulunamadı.");
  }
  await prisma.googleAdAccount.update({ where: { id: adAccountId }, data: { clientId } });
  revalidatePath("/reklam-paneli");
  revalidatePath("/panel/reklamlar");
}
