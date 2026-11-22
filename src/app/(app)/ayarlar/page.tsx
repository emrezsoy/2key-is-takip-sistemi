import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDriveConfigured } from "@/lib/drive";
import { ChangePasswordForm } from "@/app/(app)/profil/ChangePasswordForm";
import { DriveSettings } from "./DriveSettings";

export default async function AyarlarPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const storageDriver = process.env.STORAGE_DRIVER ?? "local";
  const maxUploadMb = process.env.MAX_UPLOAD_SIZE_MB ?? "2048";
  const smtpConfigured = Boolean(process.env.SMTP_HOST);
  const [driveConnected, driveFileCount] = await Promise.all([
    isDriveConfigured(),
    prisma.storedFile.count(),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold">Ayarlar</h1>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="mb-3 text-sm font-bold">Sistem Yapılandırması</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-(--color-text-muted)">Dosya depolama</dt>
            <dd className="font-medium">{storageDriver}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-(--color-text-muted)">Maks. dosya boyutu</dt>
            <dd className="font-medium">{maxUploadMb} MB</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-(--color-text-muted)">E-posta bildirimleri (SMTP)</dt>
            <dd className={`font-medium ${smtpConfigured ? "text-status-done" : "text-brand-600"}`}>
              {smtpConfigured ? "Yapılandırıldı" : "Yapılandırılmadı"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-(--color-text-muted)">
          Bu ayarlar .env dosyasından okunur; SMTP bilgileri girilince yeni
          görev bildirimleri ve şifremi unuttum e-postaları otomatik aktif
          olur.
        </p>
      </div>

      <DriveSettings
        connected={driveConnected}
        defaultRootId="0ADolc626LRfEUk9PVA"
        fileCount={driveFileCount}
      />

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <h2 className="mb-4 text-sm font-bold">Şifre Değiştir</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
