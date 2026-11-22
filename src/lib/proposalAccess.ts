import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

/** Teklifler sayfasını kullanma yetkisi: admin her zaman; diğer ekip üyeleri Çalışanlar ekranındaki işarete göre. */
export async function canUseProposals(user: SessionUser): Promise<boolean> {
  if (user.role === "CLIENT") return false;
  if (user.role === "ADMIN") return true;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { proposalAccess: true, isActive: true, isDeleted: true },
  });
  return !!row && row.isActive && !row.isDeleted && row.proposalAccess;
}

/** Hatırlatma alacaklar: Çalışanlar ekranında "Teklif hatırlatmaları" işaretli aktif kişiler.
 * Kimse işaretli değilse hatırlatma kaybolmasın diye adminlere gider. */
export async function proposalRecipients(): Promise<{ id: string }[]> {
  const chosen = await prisma.user.findMany({
    where: { isActive: true, isDeleted: false, role: { not: "CLIENT" }, proposalAccess: true },
    select: { id: true },
  });
  if (chosen.length > 0) return chosen;
  return prisma.user.findMany({
    where: { isActive: true, isDeleted: false, role: "ADMIN" },
    select: { id: true },
  });
}

export async function hasChosenRecipients(): Promise<boolean> {
  return (
    (await prisma.user.count({
      where: { isActive: true, isDeleted: false, role: { not: "CLIENT" }, proposalAccess: true },
    })) > 0
  );
}
