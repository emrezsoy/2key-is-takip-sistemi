import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPortalUser, SOCIAL_SERVICE_MESSAGE } from "@/lib/clientPortal";
import type { SessionUser } from "@/lib/permissions";

/** İçerik Paneli yetkisi (staff): admin her zaman, diğerleri veritabanındaki işarete göre. */
export async function staffHasContentAccess(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "CLIENT") return false;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { contentAccess: true, isActive: true, isDeleted: true },
  });
  return !!row && row.isActive && !row.isDeleted && row.contentAccess;
}

export type ContentActor = { id: string; name: string; isClient: boolean };

/** Bir müşterinin içeriğini düzenleyebilecek kişi: kendi müşteri hesabı, admin veya içerik yetkisi olan ekip üyesi. */
export async function requireContentActor(clientId: string): Promise<ContentActor> {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  if (session.user.role === "CLIENT") {
    const portal = await getPortalUser();
    if (!portal || portal.mustChangePassword || portal.clientId !== clientId) {
      throw new Error("Bu işlem için yetkiniz yok.");
    }
    if (!portal.socialManaged) throw new Error(SOCIAL_SERVICE_MESSAGE);
    if (!portal.contentEditable) throw new Error("İçerik düzenleme yetkiniz yok, bu bölümü sadece görüntüleyebilirsiniz.");
    return { id: portal.id, name: portal.fullName, isClient: true };
  }
  if (!(await staffHasContentAccess(session.user))) throw new Error("İçerik düzenleme yetkiniz yok.");
  return { id: session.user.id, name: session.user.name ?? session.user.username, isClient: false };
}
