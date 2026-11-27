"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageEmployees } from "@/lib/permissions";
import { notifyAccountCreated } from "@/lib/notifications";
import { ROLE_LABEL } from "@/lib/format";
import type { PaymentType, Role, ShareCalendarAccess } from "@prisma/client";

const SHARE_ACCESS_VALUES: ShareCalendarAccess[] = ["NONE", "USE", "EDIT"];

function parseShareAccess(formData: FormData, role: Role): ShareCalendarAccess {
  if (role === "ADMIN") return "NONE"; // admin zaten tam yetkili
  const raw = String(formData.get("shareCalendarAccess") ?? "NONE") as ShareCalendarAccess;
  return SHARE_ACCESS_VALUES.includes(raw) ? raw : "NONE";
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !canManageEmployees(session.user)) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  return session.user;
}

export async function createEmployee(formData: FormData) {
  await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "EMPLOYEE") as Role;
  const employmentType = String(formData.get("employmentType") ?? "").trim();
  const paymentType = String(formData.get("paymentType") ?? "DAILY") as PaymentType;
  const dailyRateRaw = formData.get("dailyRate");
  const monthlyRateRaw = formData.get("monthlyRate");
  const supervisorId = String(formData.get("supervisorId") ?? "") || null;
  const leadClientIds = formData.getAll("leadClientIds").map(String);

  if (!fullName || !username || !password || !email) {
    throw new Error("Zorunlu alanlar eksik.");
  }
  if (password.length < 6) {
    throw new Error("Şifre en az 6 karakter olmalı.");
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) throw new Error("Bu kullanıcı adı zaten kullanımda.");

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) throw new Error("Bu e-posta adresi zaten kullanımda.");

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      fullName,
      username,
      email,
      passwordHash,
      role,
      employmentType: employmentType || null,
      paymentType,
      dailyRate: paymentType === "DAILY" && dailyRateRaw ? Number(dailyRateRaw) : null,
      monthlyRate: paymentType === "MONTHLY" && monthlyRateRaw ? Number(monthlyRateRaw) : null,
      supervisorId: role === "EMPLOYEE" ? supervisorId : null,
      shareCalendarAccess: parseShareAccess(formData, role),
      // Reklam yöneten, paneli de görür.
      adPanelAccess: role !== "ADMIN" && (formData.get("adPanelAccess") === "on" || formData.get("adManageAccess") === "on"),
      adManageAccess: role !== "ADMIN" && formData.get("adManageAccess") === "on",
      proposalAccess: formData.get("proposalAccess") === "on",
      contentAccess: role !== "ADMIN" && formData.get("contentAccess") === "on",
      dmAccess: role !== "ADMIN" && formData.get("dmAccess") === "on",
      ...(role !== "ADMIN" && leadClientIds.length > 0
        ? { ledClients: { connect: leadClientIds.map((id) => ({ id })) } }
        : {}),
    },
  });

  await notifyAccountCreated({
    to: email,
    fullName,
    username,
    password,
    roleLabel: ROLE_LABEL[role],
  });

  revalidatePath("/calisanlar");
}

export async function updateEmployee(userId: string, formData: FormData) {
  await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "EMPLOYEE") as Role;
  const employmentType = String(formData.get("employmentType") ?? "").trim();
  const paymentType = String(formData.get("paymentType") ?? "DAILY") as PaymentType;
  const dailyRateRaw = formData.get("dailyRate");
  const monthlyRateRaw = formData.get("monthlyRate");
  const supervisorId = String(formData.get("supervisorId") ?? "") || null;
  const isActive = formData.get("isActive") === "on";
  const leadClientIds = formData.getAll("leadClientIds").map(String);
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!fullName || !email) {
    throw new Error("Zorunlu alanlar eksik.");
  }
  if (newPassword && newPassword.length < 6) {
    throw new Error("Yeni şifre en az 6 karakter olmalı.");
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail && existingEmail.id !== userId) {
    throw new Error("Bu e-posta adresi zaten kullanımda.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      fullName,
      email,
      role,
      employmentType: employmentType || null,
      paymentType,
      dailyRate: paymentType === "DAILY" && dailyRateRaw ? Number(dailyRateRaw) : null,
      monthlyRate: paymentType === "MONTHLY" && monthlyRateRaw ? Number(monthlyRateRaw) : null,
      supervisorId: role === "EMPLOYEE" ? supervisorId : null,
      isActive,
      shareCalendarAccess: parseShareAccess(formData, role),
      // Reklam yöneten, paneli de görür.
      adPanelAccess: role !== "ADMIN" && (formData.get("adPanelAccess") === "on" || formData.get("adManageAccess") === "on"),
      adManageAccess: role !== "ADMIN" && formData.get("adManageAccess") === "on",
      proposalAccess: formData.get("proposalAccess") === "on",
      contentAccess: role !== "ADMIN" && formData.get("contentAccess") === "on",
      dmAccess: role !== "ADMIN" && formData.get("dmAccess") === "on",
      ledClients: {
        set: role === "ADMIN" ? [] : leadClientIds.map((id) => ({ id })),
      },
      ...(role === "ADMIN" || role === "SUPERVISOR"
        ? { emailNotificationsEnabled: formData.get("emailNotificationsEnabled") === "on" }
        : {}),
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });

  revalidatePath("/calisanlar");
}

export async function deleteEmployee(userId: string, reason: string) {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    throw new Error("Kendi hesabınızı silemezsiniz.");
  }
  if (!reason.trim()) {
    throw new Error("Silme sebebi zorunludur.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isDeleted: true,
      isActive: false,
      deletionReason: reason.trim(),
      deletedAt: new Date(),
    },
  });

  revalidatePath("/calisanlar");
}
