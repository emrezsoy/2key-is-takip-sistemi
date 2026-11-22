import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { getClientScope, inClientScope } from "@/lib/clientAccess";

/** Reklam Paneli'ni görme yetkisi: admin her zaman, diğerleri veritabanındaki işarete göre
 * (reklam yönetme yetkisi olan, paneli de görür). */
export async function canViewAdPanel(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { adPanelAccess: true, adManageAccess: true, isActive: true, isDeleted: true },
  });
  return !!row && row.isActive && !row.isDeleted && (row.adPanelAccess || row.adManageAccess);
}

/** Reklam yönetme yetkisi (kampanya kurma, kopyalama, düzenleme, yayına alma / durdurma). */
export async function canManageAds(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "CLIENT") return false;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { adManageAccess: true, isActive: true, isDeleted: true },
  });
  return !!row && row.isActive && !row.isDeleted && row.adManageAccess;
}

/** Kullanıcının kampanya yönetebileceği reklam hesapları: yetkisi olmalı, hesap Meta'da yönetilebilir olmalı
 * ve admin değilse hesabın müşterisinden sorumlu olmalı. */
export async function manageableAdAccounts(user: SessionUser) {
  if (!(await canManageAds(user))) return [];
  const scope = await getClientScope(user);
  const rows = await prisma.adAccount.findMany({
    where: { canManage: true, ...(scope ? { clientId: { in: scope } } : {}) },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.filter((a) => inClientScope(scope, a.clientId));
}

/** Tek bir hesap üzerinde yönetim yetkisini doğrular; hesabı döndürür. */
export async function requireManageableAccount(user: SessionUser, accountMetaId: string) {
  if (!(await canManageAds(user))) throw new Error("Reklam yönetme yetkiniz yok.");
  const account = await prisma.adAccount.findUnique({
    where: { metaId: accountMetaId.replace(/^act_/, "") },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!account) throw new Error("Reklam hesabı bulunamadı.");
  if (!inClientScope(await getClientScope(user), account.clientId)) {
    throw new Error("Bu müşterinin reklamlarını yönetme yetkiniz yok.");
  }
  if (!account.canManage) {
    throw new Error("Bu reklam hesabında kampanya yönetme izni yok (Meta'da sistem kullanıcısına \"Kampanyaları yönet\" yetkisi verilmeli).");
  }
  return account;
}
