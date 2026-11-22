import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";
import { sendPushToUser } from "@/lib/webpush";

/** Uygulama içi bildirim oluşturur; kullanıcının telefonu/tarayıcısı abone ise anlık bildirim (push) de gönderir. */
export async function pushNotification(params: {
  userId: string;
  taskId?: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Bildirime tıklanınca açılacak sayfa (push için). */
  url?: string;
}) {
  const { userId, taskId, type, title, message, url } = params;
  await prisma.notification.create({
    data: { userId, taskId, type, title, message },
  });
  // Push gecikse/başarısız olsa da asıl işlemi bekletmesin.
  void sendPushToUser(userId, { title, body: message, url, tag: type });
}
