import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/inAppNotify";

/** Müşteri talebinden doğan iş tamamlandığında talebi açan müşteri kullanıcısına haber verir. */
export async function notifyRequesterTaskDone(taskId: string) {
  const request = await prisma.clientRequest.findUnique({
    where: { taskId },
    select: { createdById: true, title: true },
  });
  if (!request) return;
  await pushNotification({
    userId: request.createdById,
    taskId,
    type: "TASK_DONE",
    title: "Talebiniz tamamlandı",
    message: `"${request.title}" işi tamamlandı.`,
    url: "/panel/talepler",
  });
}

/** Yeni müşteri talebini tüm adminlere bildirir. */
export async function notifyAdminsNewRequest(params: { clientName: string; title: string; revision?: boolean }) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, isDeleted: false },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      pushNotification({
        userId: a.id,
        type: "CLIENT_REQUEST",
        title: params.revision ? "Yeni revize isteği" : "Yeni müşteri talebi",
        message: `${params.clientName}: "${params.title}"`,
        url: "/talepler",
      })
    )
  );
}
