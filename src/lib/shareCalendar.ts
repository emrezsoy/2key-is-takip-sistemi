import type { ShareCalendarAccess } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

/** Kullanıcının Paylaşım Takvimi yetkisi. Admin her zaman tam yetkili; diğerlerinde
 * yetki veritabanından okunur (oturum token'ına gömülmez, böylece değişiklik anında geçerli olur). */
export async function getShareAccess(user: SessionUser): Promise<ShareCalendarAccess> {
  if (user.role === "ADMIN") return "EDIT";
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { shareCalendarAccess: true, isActive: true, isDeleted: true },
  });
  if (!row || !row.isActive || row.isDeleted) return "NONE";
  return row.shareCalendarAccess;
}

/** Paylaşım bildirimlerini alacak ekip: adminler ve paylaşım takvimi yetkisi olup o müşteriden sorumlu olanlar. */
export async function shareRecipients(clientId: string | null) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      role: { not: "CLIENT" },
      OR: [
        { role: "ADMIN" },
        ...(clientId ? [{ shareCalendarAccess: { not: "NONE" as const }, ledClients: { some: { id: clientId } } }] : []),
      ],
    },
    select: { id: true },
  });
}

export const canViewShareCalendar = (access: ShareCalendarAccess) => access !== "NONE";
export const canEditShareCalendar = (access: ShareCalendarAccess) => access === "EDIT";

export const SHARE_ACCESS_LABEL: Record<ShareCalendarAccess, string> = {
  NONE: "Yetki yok",
  USE: "Sadece kullanım (indir / kopyala)",
  EDIT: "Kullanım + düzenleme",
};

export const SHARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
