import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type PortalUser = {
  id: string;
  fullName: string;
  username: string;
  clientId: string;
  clientName: string;
  /** Sosyal medya yönetim hizmeti alıyor mu (İçerik, Talepler, Paylaşım Takvimi)? */
  socialManaged: boolean;
  /** İçerik panelini düzenleyebilir mi (false = sadece görüntüleme). */
  contentEditable: boolean;
  /** Tamamlanan işler (içerik listesi ve talepler) için revize isteği gönderebilir mi. */
  shareRevisionEnabled: boolean;
  mustChangePassword: boolean;
  /** Tanıtım turu daha önce tamamlandı/atlandı mı? */
  tourDone: boolean;
};

export const SOCIAL_SERVICE_MESSAGE =
  "Sosyal medya yönetim hizmeti almıyorsunuz. Bu bölüm yalnızca sosyal medya yönetimi hizmetimizi alan müşterilerimize açıktır. Hizmet hakkında bilgi almak isterseniz bizimle iletişime geçebilirsiniz.";

/** Müşteri paneli oturumu: sadece CLIENT rolü, aktif hesap ve aktif bir müşteriye bağlı olmalı.
 * Bilgiler veritabanından okunur; böylece hesap pasife alınınca anında etkili olur. */
export async function getPortalUser(): Promise<PortalUser | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return null;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      fullName: true,
      username: true,
      isActive: true,
      isDeleted: true,
      mustChangePassword: true,
      portalTourDoneAt: true,
      clientAccount: { select: { id: true, name: true, isActive: true, socialManaged: true, contentEditable: true, shareRevisionEnabled: true } },
    },
  });
  if (!u || !u.isActive || u.isDeleted || !u.clientAccount || !u.clientAccount.isActive) return null;
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    clientId: u.clientAccount.id,
    clientName: u.clientAccount.name,
    socialManaged: u.clientAccount.socialManaged,
    contentEditable: u.clientAccount.contentEditable,
    shareRevisionEnabled: u.clientAccount.shareRevisionEnabled,
    mustChangePassword: u.mustChangePassword,
    tourDone: !!u.portalTourDoneAt,
  };
}

export async function requirePortalUser(): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) redirect("/giris");
  return user;
}

/** Sunucu eylemleri için: giriş yapmış müşteri kullanıcısını döner, yoksa hata fırlatır.
 * İlk şifre belirlenmeden hiçbir işlem yapılamaz. */
export async function requirePortalActor(): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  if (user.mustChangePassword) throw new Error("Önce kendi şifrenizi belirlemelisiniz.");
  return user;
}

/** Çalışma ekibinin (ADMIN/SUPERVISOR/EMPLOYEE) oturumu mu? Müşteri hesapları false döner. */
export const isStaffRole = (role: string | undefined) =>
  role === "ADMIN" || role === "SUPERVISOR" || role === "EMPLOYEE";
