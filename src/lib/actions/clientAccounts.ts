"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ClientNotifyMode } from "@prisma/client";

const NOTIFY_MODES: ClientNotifyMode[] = ["DAILY", "WEEKLY", "LOGIN_POPUP", "HOURLY", "NONE"];

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Bu işlem için yetkiniz yok.");
  return session.user;
}

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/i;

/** Müşteriye panel girişi açar. Geçici şifreyle açılır; müşteri ilk girişte kendi şifresini belirler. */
export async function createClientLogin(input: {
  clientId: string;
  fullName: string;
  username: string;
  tempPassword: string;
  email?: string;
}) {
  await requireAdmin();
  const fullName = input.fullName.trim();
  const username = input.username.trim().toLowerCase();
  if (!fullName) throw new Error("Ad soyad / yetkili adı gerekli.");
  if (!USERNAME_RE.test(username)) throw new Error("Kullanıcı adı 3-40 karakter, harf/rakam/nokta/tire olmalı.");
  if (input.tempPassword.length < 6) throw new Error("Geçici şifre en az 6 karakter olmalı.");

  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
  if (!client) throw new Error("Müşteri bulunamadı.");
  if (await prisma.user.findUnique({ where: { username } })) throw new Error("Bu kullanıcı adı zaten kullanımda.");

  // E-posta zorunlu/benzersiz alan; müşteri vermediyse benzersiz bir yer tutucu yazılır (mail gönderilmez).
  const email = input.email?.trim() || `${username}@musteri.panel`;
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("Bu e-posta adresi zaten kullanımda.");

  await prisma.user.create({
    data: {
      fullName,
      username,
      email,
      role: "CLIENT",
      clientId: client.id,
      passwordHash: await bcrypt.hash(input.tempPassword, 10),
      mustChangePassword: true,
      emailNotificationsEnabled: false,
    },
  });
  revalidatePath("/musteriler");
}

/** Yeni geçici şifre verir; müşteri bir sonraki girişte yeniden kendi şifresini belirler. */
export async function resetClientPassword(userId: string, tempPassword: string) {
  await requireAdmin();
  if (tempPassword.length < 6) throw new Error("Geçici şifre en az 6 karakter olmalı.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "CLIENT") throw new Error("Müşteri hesabı bulunamadı.");
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
  });
  revalidatePath("/musteriler");
}

export async function setClientLoginActive(userId: string, isActive: boolean) {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "CLIENT") throw new Error("Müşteri hesabı bulunamadı.");
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
  revalidatePath("/musteriler");
}

/** Müşteriye verdiğimiz reklam yönetimi hizmetleri (Meta / Google). Müşteri paneli sadece işaretli platformların verisini gösterir. */
export async function saveClientAdServices(input: {
  clientId: string;
  meta: boolean;
  google: boolean;
  social: boolean;
  /** İçerik panelini düzenleyebilir (sosyal medya hizmeti varsa anlamlı). */
  contentEdit: boolean;
  /** Paylaşım takviminde revize isteyebilir. */
  shareRevision: boolean;
}) {
  await requireAdmin();
  await prisma.client.update({
    where: { id: input.clientId },
    data: {
      metaAdsManaged: !!input.meta,
      googleAdsManaged: !!input.google,
      socialManaged: !!input.social,
      contentEditable: !!input.social && !!input.contentEdit,
      shareRevisionEnabled: !!input.social && !!input.shareRevision,
    },
  });
  revalidatePath("/musteriler");
  revalidatePath("/panel", "layout");
}

/** Müşteri başına bildirim türü ve ödeme günü. */
export async function saveClientNotifySettings(input: {
  clientId: string;
  notifyMode: ClientNotifyMode;
  paymentDueDay: number | null;
}) {
  await requireAdmin();
  if (!NOTIFY_MODES.includes(input.notifyMode)) throw new Error("Geçersiz bildirim türü.");
  const day = input.paymentDueDay;
  if (day != null && (!Number.isInteger(day) || day < 1 || day > 28)) {
    throw new Error("Ödeme günü 1-28 arasında olmalı.");
  }
  await prisma.client.update({
    where: { id: input.clientId },
    data: { notifyMode: input.notifyMode, paymentDueDay: day },
  });
  revalidatePath("/musteriler");
}
