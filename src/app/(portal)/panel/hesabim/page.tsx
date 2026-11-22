import { requirePortalUser } from "@/lib/clientPortal";
import { getVapidPublicKey } from "@/lib/webpush";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/app/(app)/profil/ChangePasswordForm";
import { PushSetup } from "@/components/portal/PushSetup";
import { RestartTourButton } from "@/components/portal/RestartTourButton";
import { ThemeSwitch } from "@/components/portal/ThemeSwitch";
import { NOTIFY_LABEL } from "@/lib/portalText";

export default async function PortalAccount() {
  const user = await requirePortalUser();
  const [vapidPublicKey, client] = await Promise.all([
    getVapidPublicKey(),
    prisma.client.findUniqueOrThrow({ where: { id: user.clientId }, select: { notifyMode: true } }),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold">Hesabım</h1>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <p className="text-lg font-bold">{user.fullName}</p>
        <p className="text-sm text-(--color-text-muted)">
          {user.clientName} · @{user.username}
        </p>
        <p className="mt-3 text-xs text-(--color-text-muted)">
          Ödeme bildirimi tercihiniz: <strong className="text-(--color-text)">{NOTIFY_LABEL[client.notifyMode]}</strong>. Değiştirmek için bizimle iletişime geçin.
        </p>
      </div>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="mb-3 text-sm font-bold">Görünüm</h2>
        <ThemeSwitch />
        <p className="mt-2 text-xs text-(--color-text-muted)">Koyu mod, telefonunuzda gece kullanımı için daha rahattır.</p>
      </div>

      <PushSetup vapidPublicKey={vapidPublicKey} />

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="mb-1 text-sm font-bold">Panel turu</h2>
        <p className="mb-3 text-xs text-(--color-text-muted)">Panelin bölümlerini tanıtan kısa turu istediğiniz zaman tekrar izleyebilirsiniz.</p>
        <RestartTourButton />
      </div>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="mb-4 text-sm font-bold">Şifre Değiştir</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
