import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/inAppNotify";

/** Müşterinin panel kullanıcıları (aktif). */
export async function dmClientUserIds(clientId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { clientId, role: "CLIENT", isActive: true, isDeleted: false },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Ekip tarafı alıcılar: adminler + Mesaj Otomasyonu yetkisi olan ve bu müşterinin sorumlusu olan ekip üyeleri. */
export async function dmStaffUserIds(clientId: string | null): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      OR: [
        { role: "ADMIN" },
        ...(clientId ? [{ role: { in: ["SUPERVISOR", "EMPLOYEE"] as ("SUPERVISOR" | "EMPLOYEE")[] }, dmAccess: true, ledClients: { some: { id: clientId } } }] : []),
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export const dmAdminUrl = (clientId: string, tab?: string) => `/mesaj-otomasyonu/${encodeURIComponent(clientId)}${tab ? `?sekme=${tab}` : ""}`;
export const DM_PORTAL_URL = "/panel/mesajlar";

/** Mesaj Otomasyonu bildirimi: uygulama içi + telefon (push). Hata fırlatmaz. */
export async function notifyDm(params: {
  clientId: string;
  type: NotificationType;
  title: string;
  message: string;
  toClient?: boolean;
  toStaff?: boolean;
  /** Ekip tarafında sadece adminlere (ör. yenileme hatırlatması). */
  adminsOnly?: boolean;
  /** Müşteriye ulaşılamazsa (aktif panel kullanıcısı yok) ekibe gönder. */
  fallbackToStaff?: boolean;
  clientUrl?: string;
  staffUrl?: string;
}) {
  try {
    const { clientId, type, title, message } = params;
    const jobs: Promise<unknown>[] = [];
    let clientReached = false;
    if (params.toClient) {
      const clientIds = await dmClientUserIds(clientId);
      clientReached = clientIds.length > 0;
      for (const userId of clientIds) {
        jobs.push(pushNotification({ userId, type, title, message, url: params.clientUrl ?? DM_PORTAL_URL }));
      }
    }
    // Müşterinin işi olan bildirimler (randevu, AI sorusu…) sadece müşteriye gider.
    // Müşterinin aktif panel kullanıcısı yoksa kimse görmezdi: o durumda ekibe düşer.
    const staffFallback = !!params.fallbackToStaff && !clientReached;
    if (params.toStaff || params.adminsOnly || staffFallback) {
      const ids = params.adminsOnly
        ? (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true, isDeleted: false }, select: { id: true } })).map((u) => u.id)
        : await dmStaffUserIds(clientId);
      for (const userId of ids) {
        jobs.push(pushNotification({ userId, type, title, message, url: params.staffUrl ?? dmAdminUrl(clientId) }));
      }
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error("Mesaj Otomasyonu bildirimi gönderilemedi:", e instanceof Error ? e.message : e);
  }
}
