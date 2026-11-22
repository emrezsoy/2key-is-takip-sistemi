import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/format";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { AvatarUploadForm } from "./AvatarUploadForm";
import { PushSetup } from "@/components/portal/PushSetup";
import { getVapidPublicKey } from "@/lib/webpush";

export default async function ProfilPage() {
  const session = await auth();
  const me = await prisma.user.findUnique({ where: { id: session!.user.id } });
  if (!me) return null;
  const vapidPublicKey = await getVapidPublicKey();

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold">Profil</h1>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <div className="flex items-center gap-4">
          <AvatarUploadForm fullName={me.fullName} avatarUrl={me.avatarUrl} />
          <div>
            <p className="text-lg font-bold">{me.fullName}</p>
            <p className="text-sm text-(--color-text-muted)">{ROLE_LABEL[me.role]}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-(--color-text-muted)">Kullanıcı adı</dt>
            <dd className="font-medium">{me.username}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">E-posta</dt>
            <dd className="font-medium">{me.email}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Çalışma şekli</dt>
            <dd className="font-medium">{me.employmentType ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div id="uygulama" className="scroll-mt-4">
        <PushSetup vapidPublicKey={vapidPublicKey} />
      </div>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="mb-4 text-sm font-bold">Şifre Değiştir</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
