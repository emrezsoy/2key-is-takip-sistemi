import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

/** Kullanıcının "müşteri sorumlusu" olduğu aktif müşterilerin id'leri. */
export async function getLedClientIds(userId: string): Promise<string[]> {
  const rows = await prisma.client.findMany({
    where: { isActive: true, leads: { some: { id: userId } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Müşterinin işlerini yönetebilir mi? Admin hepsini, müşteri sorumlusu
 * sadece sorumlu olduğu müşterilerin işlerini ekleyip paylaştırabilir. */
export async function canManageClientJobs(
  user: SessionUser,
  clientId: string | null
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (!clientId) return false;
  const count = await prisma.client.count({
    where: { id: clientId, isActive: true, leads: { some: { id: user.id } } },
  });
  return count > 0;
}

/** Paylaşım Takvimi, Reklam Paneli ve Sosyal Medya'da kullanıcının görebileceği müşteriler.
 * `null` = hepsi (admin). Diğer herkes (süpervizör, çalışan) sadece sorumlu olduğu müşterileri görür;
 * hiçbir müşteriden sorumlu değilse boş liste döner (yetkisi olsa bile veri görmez). */
export async function getClientScope(user: SessionUser): Promise<string[] | null> {
  if (user.role === "ADMIN") return null;
  return getLedClientIds(user.id);
}

/** Müşteri, kullanıcının görebileceği müşterilerden mi? Müşterisi olmayan kayıtları sadece admin görür. */
export function inClientScope(scope: string[] | null, clientId: string | null | undefined): boolean {
  if (scope === null) return true;
  return !!clientId && scope.includes(clientId);
}

/** Kapsam dışı müşteriye ait kayıtta işlem yapılmasını engeller. */
export async function assertClientInScope(user: SessionUser, clientId: string | null | undefined) {
  if (!inClientScope(await getClientScope(user), clientId)) {
    throw new Error("Bu müşteri için yetkiniz yok; sadece sorumlu olduğunuz müşterilerde işlem yapabilirsiniz.");
  }
}
