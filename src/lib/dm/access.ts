import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { getClientScope, inClientScope } from "@/lib/clientAccess";

/** Mesaj Otomasyonu ekranlarını kullanabilir mi: admin her zaman; diğer ekip üyeleri Çalışanlar'daki işarete göre
 * (ve sadece sorumlu oldukları müşterilerde). Müşteri hesapları kendi panelini (/panel/mesajlar) kullanır. */
export async function canUseDm(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "CLIENT") return false;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { dmAccess: true, isActive: true, isDeleted: true },
  });
  return !!row && row.isActive && !row.isDeleted && row.dmAccess;
}

/** Ekip üyesinin görebileceği müşteriler (null = hepsi). Yetkisi yoksa boş liste. */
export async function dmClientScope(user: SessionUser): Promise<string[] | null> {
  if (!(await canUseDm(user))) return [];
  return getClientScope(user);
}

export type DmActor = { id: string; name: string; role: "ADMIN" | "STAFF" | "CLIENT"; clientId: string };

/** Bir müşterinin Mesaj Otomasyonu verisinde işlem yapacak kişiyi doğrular: admin, yetkili ve sorumlu ekip üyesi
 * ya da o müşterinin kendi panel kullanıcısı. */
export async function requireDmActor(
  user: SessionUser & { name?: string | null; username?: string | null },
  clientId: string,
  opts: { allowClient?: boolean; adminOnly?: boolean } = {}
): Promise<DmActor> {
  const name = user.name ?? user.username ?? "Kullanıcı";
  if (user.role === "ADMIN") return { id: user.id, name, role: "ADMIN", clientId };
  if (opts.adminOnly) throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
  if (user.role === "CLIENT") {
    if (!opts.allowClient) throw new Error("Bu işlem için yetkiniz yok.");
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clientId: true, isActive: true, isDeleted: true, fullName: true, clientAccount: { select: { isActive: true, dmManaged: true } } },
    });
    if (!u || !u.isActive || u.isDeleted || u.clientId !== clientId || !u.clientAccount?.isActive) {
      throw new Error("Bu işlem için yetkiniz yok.");
    }
    if (!u.clientAccount.dmManaged) throw new Error("Mesaj Otomasyonu hizmeti hesabınızda tanımlı değil.");
    return { id: user.id, name: u.fullName, role: "CLIENT", clientId };
  }
  if (!(await canUseDm(user))) throw new Error("Mesaj Otomasyonu yetkiniz yok.");
  if (!inClientScope(await getClientScope(user), clientId)) {
    throw new Error("Bu müşteri için yetkiniz yok; sadece sorumlu olduğunuz müşterilerde işlem yapabilirsiniz.");
  }
  return { id: user.id, name, role: "STAFF", clientId };
}
