"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewAdPanel } from "@/lib/adsAccess";
import { assertClientInScope } from "@/lib/clientAccess";
import { syncSocial } from "@/lib/socialSync";

async function requireAccess() {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT" || !(await canViewAdPanel(session.user))) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  return session.user;
}

const refresh = () => {
  revalidatePath("/sosyal-medya");
  revalidatePath("/panel", "layout"); // menüdeki "Gelişim" bağlantısı da güncellensin
};

/** Meta'dan sayfa / Instagram verilerini şimdi çeker (otomatik çekim 6 saatte bir çalışır). */
export async function refreshSocial() {
  await requireAccess();
  const res = await syncSocial({});
  refresh();
  return res;
}

/** Hesabın müşterisi kullanıcının sorumlu olduğu müşterilerden olmalı (admin hepsini yönetir). */
async function requireAccount(accountId: string) {
  const user = await requireAccess();
  const acc = await prisma.socialAccount.findUnique({ where: { id: accountId }, select: { clientId: true } });
  if (!acc) throw new Error("Hesap bulunamadı.");
  await assertClientInScope(user, acc.clientId);
  return user;
}

export async function setSocialClient(accountId: string, clientId: string | null) {
  const user = await requireAccount(accountId);
  // Admin dışındakiler hesabı müşteriden ayıramaz, sadece sorumlu oldukları başka bir müşteriye bağlayabilir.
  if (user.role !== "ADMIN") await assertClientInScope(user, clientId);
  await prisma.socialAccount.update({ where: { id: accountId }, data: { clientId: clientId || null } });
  refresh();
}

/** Müşteri panelindeki "Gelişim" sayfasında bu hesabın görünüp görünmeyeceği. */
export async function setSocialVisible(accountId: string, visible: boolean) {
  await requireAccount(accountId);
  await prisma.socialAccount.update({ where: { id: accountId }, data: { visibleToClient: visible } });
  refresh();
}
