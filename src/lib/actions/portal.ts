"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/webpush";

/** İlk giriş: geçici şifreyle giren müşteri kendi şifresini belirler (eski şifre sorulmaz, çünkü az önce girildi). */
export async function setFirstPassword(newPassword: string, repeat: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") throw new Error("Oturum bulunamadı.");
  if (newPassword.length < 8) throw new Error("Şifre en az 8 karakter olmalı.");
  if (newPassword !== repeat) throw new Error("Şifreler aynı değil.");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, passwordHash: true },
  });
  if (!user?.mustChangePassword) throw new Error("Şifre zaten belirlenmiş.");
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new Error("Yeni şifre geçici şifreyle aynı olamaz.");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
  });
  revalidatePath("/panel");
}

/** Tanıtım turu bitti ya da atlandı: bir daha kendiliğinden açılmaz (Hesabım'dan yeniden başlatılabilir). */
export async function completePortalTour() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return;
  await prisma.user.update({ where: { id: session.user.id }, data: { portalTourDoneAt: new Date() } });
}

/** Telefona bildirim abonelikleri: müşteri ve ekip hesapları için ortak (aktif, oturumu açık kullanıcı). */
async function requireActiveUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isActive: true, isDeleted: true, mustChangePassword: true },
  });
  if (!u || !u.isActive || u.isDeleted) throw new Error("Oturum bulunamadı.");
  if (u.mustChangePassword) throw new Error("Önce kendi şifrenizi belirlemelisiniz.");
  return u;
}

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(sub: PushSub) {
  const user = await requireActiveUser();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Geçersiz abonelik.");
  if (!sub.endpoint.startsWith("https://")) throw new Error("Geçersiz abonelik adresi.");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireActiveUser();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
}

export async function sendTestPush() {
  const user = await requireActiveUser();
  const sent = await sendPushToUser(user.id, {
    title: "2 Key idea",
    body: "Bildirimler bu cihazda çalışıyor.",
    url: "/panel",
    tag: "test",
  });
  if (sent === 0) throw new Error("Bu hesaba kayıtlı cihaz bulunamadı. Önce bildirimleri açın.");
}
