import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditShareCalendar, getShareAccess } from "@/lib/shareCalendar";
import { canManageClientJobs } from "@/lib/clientAccess";

/** Bir işin teslim dosyalarını dışarı (paylaşım takvimi, içerik listesi, müşteri talebi) gönderebilen kişi:
 * admin her işi; diğerleri sadece sorumlu oldukları müşterinin işini (`leadOnly` true döner).
 * Müşterisi olmayan işi, paylaşım takvimi düzenleme yetkisi olan kişi sorumlu olduğu bir müşteriye gönderebilir. */
export async function requireSender(taskId: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Oturum bulunamadı.");
  if (session.user.role === "ADMIN") return { user: session.user, leadOnly: false };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { clientId: true } });
  if (task?.clientId && (await canManageClientJobs(session.user, task.clientId))) {
    return { user: session.user, leadOnly: true };
  }
  if (task && !task.clientId && canEditShareCalendar(await getShareAccess(session.user))) {
    return { user: session.user, leadOnly: false };
  }
  throw new Error("Bu işin müşterisinden sorumlu değilsiniz; sadece sorumlu olduğunuz müşterilere gönderebilirsiniz.");
}

/** Müşterinin onaylanmış içeriğini paylaşım takvimine gönderebilen ya da teslimi kaldırabilen kişi:
 * admin ya da o müşterinin sorumlusu. */
export async function requireClientSender(clientId: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Oturum bulunamadı.");
  if (session.user.role === "ADMIN") return { user: session.user, leadOnly: false };
  if (await canManageClientJobs(session.user, clientId)) return { user: session.user, leadOnly: true };
  throw new Error("Bu işlem için yetkiniz yok.");
}
