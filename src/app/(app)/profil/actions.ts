"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { saveAvatarFile } from "@/lib/storage";

export type ChangePasswordState = { error: string | null; success: boolean };

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (newPassword.length < 6) {
    return { error: "Yeni şifre en az 6 karakter olmalı.", success: false };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "Kullanıcı bulunamadı.", success: false };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Mevcut şifre hatalı.", success: false };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return { error: null, success: true };
}

export async function updateAvatar(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) throw new Error("Dosya seçilmedi.");

  const { url } = await saveAvatarFile(file);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarUrl: url },
  });

  revalidatePath("/profil");
  revalidatePath("/calisanlar");
  revalidatePath("/", "layout");
}
