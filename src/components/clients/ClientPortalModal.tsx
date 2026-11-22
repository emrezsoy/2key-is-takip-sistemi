"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, KeyRound, Smartphone, X } from "lucide-react";
import type { ClientNotifyMode } from "@prisma/client";
import {
  createClientLogin,
  resetClientPassword,
  saveClientAdServices,
  saveClientNotifySettings,
  setClientLoginActive,
} from "@/lib/actions/clientAccounts";
import { NOTIFY_LABEL } from "@/lib/portalText";

export type PortalLogin = {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
};


const randomPassword = () => {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

const input =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";
const label = "mb-1 block text-xs font-medium text-(--color-text-muted)";

export function ClientPortalModal({
  clientId,
  clientName,
  logins,
  notifyMode,
  paymentDueDay,
  metaAdsManaged,
  googleAdsManaged,
  socialManaged,
  contentEditable,
  shareRevisionEnabled,
}: {
  clientId: string;
  clientName: string;
  logins: PortalLogin[];
  notifyMode: ClientNotifyMode;
  paymentDueDay: number | null;
  metaAdsManaged: boolean;
  googleAdsManaged: boolean;
  socialManaged: boolean;
  contentEditable: boolean;
  shareRevisionEnabled: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<ClientNotifyMode>(notifyMode);
  const [dueDay, setDueDay] = useState(paymentDueDay ? String(paymentDueDay) : "");
  const [metaOn, setMetaOn] = useState(metaAdsManaged);
  const [googleOn, setGoogleOn] = useState(googleAdsManaged);
  const [socialOn, setSocialOn] = useState(socialManaged);
  const [contentEditOn, setContentEditOn] = useState(contentEditable);
  const [revisionOn, setRevisionOn] = useState(shareRevisionEnabled);

  const run = (fn: () => Promise<void>, ok?: string) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        await fn();
        if (ok) setInfo(ok);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      }
    });
  };

  const credentialText = (u: string, p: string) =>
    `Giriş adresi: ${window.location.origin}\nKullanıcı adı: ${u}\nGeçici şifre: ${p}\n(İlk girişte kendi şifrenizi belirleyeceksiniz.)`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex items-center gap-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
      >
        <Smartphone size={13} />
        Müşteri paneli{logins.length > 0 ? ` (${logins.length})` : ""}
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
            <h2 className="text-base font-bold">Müşteri Paneli — {clientName}</h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <section className="space-y-2">
              <h3 className="text-sm font-bold">Giriş hesapları</h3>
              {logins.length === 0 && (
                <p className="text-xs text-(--color-text-muted)">Bu müşteri için henüz panel girişi açılmadı.</p>
              )}
              {logins.map((l) => (
                <div key={l.id} className="rounded-lg border border-(--color-border) p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.fullName}</p>
                      <p className="text-xs text-(--color-text-muted)">
                        @{l.username}
                        {l.mustChangePassword && " · geçici şifre bekliyor"}
                        {!l.isActive && " · pasif"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const p = randomPassword();
                            await resetClientPassword(l.id, p);
                            setCreated({ username: l.username, password: p });
                          })
                        }
                        className="flex items-center gap-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                      >
                        <KeyRound size={12} />
                        Şifre sıfırla
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setClientLoginActive(l.id, !l.isActive))}
                        className="text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                      >
                        {l.isActive ? "Pasife al" : "Aktifleştir"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {created && (
                <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
                  <p className="mb-1 font-semibold">Müşteriye iletilecek bilgiler (bir daha gösterilmez):</p>
                  <pre className="whitespace-pre-wrap font-sans">{credentialText(created.username, created.password)}</pre>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(credentialText(created.username, created.password));
                      setInfo("Panoya kopyalandı.");
                    }}
                    className="mt-2 flex items-center gap-1 font-semibold underline"
                  >
                    <Copy size={12} /> Kopyala
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-dashed border-(--color-border) p-3">
              <h3 className="text-sm font-bold">Yeni giriş hesabı aç</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Yetkili adı</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
                </div>
                <div>
                  <label className={label}>Kullanıcı adı</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className={input} />
                </div>
              </div>
              <div>
                <label className={label}>Geçici şifre (müşteri ilk girişte değiştirir)</label>
                <div className="flex gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
                  <button
                    type="button"
                    onClick={() => setPassword(randomPassword())}
                    className="shrink-0 rounded-lg border border-(--color-border) px-3 text-xs font-medium hover:bg-(--color-surface-muted)"
                  >
                    Oluştur
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={pending || !fullName.trim() || !username.trim() || password.length < 6}
                onClick={() =>
                  run(async () => {
                    await createClientLogin({ clientId, fullName, username, tempPassword: password });
                    setCreated({ username: username.trim().toLowerCase(), password });
                    setFullName("");
                    setUsername("");
                    setPassword("");
                  })
                }
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Hesabı oluştur
              </button>
            </section>

            <section className="space-y-2 rounded-lg border border-(--color-border) p-3">
              <h3 className="text-sm font-bold">Aldığı hizmetler</h3>
              <p className="text-xs text-(--color-text-muted)">
                Müşteri, panelinde sadece işaretli hizmetlerin bölümlerini kullanır. İşaretsiz hizmet için
                &quot;bu hizmeti almıyorsunuz&quot; bilgisi gösterilir. Sadece reklam alan müşterilerde &quot;Sosyal medya yönetimi&quot;
                işaretini kaldırın (İçerik Paneli, Talepler ve Paylaşım Takvimi kapanır).
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={socialOn} onChange={(e) => setSocialOn(e.target.checked)} className="h-4 w-4" />
                Sosyal medya yönetimi (içerik, tasarım talebi, paylaşım takvimi)
              </label>
              <div className={`ml-6 space-y-2 ${socialOn ? "" : "opacity-50"}`}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={socialOn && contentEditOn}
                    disabled={!socialOn}
                    onChange={(e) => setContentEditOn(e.target.checked)}
                    className="h-4 w-4"
                  />
                  İçerik panelini düzenleyebilir
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={socialOn && revisionOn}
                    disabled={!socialOn}
                    onChange={(e) => setRevisionOn(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Tamamlanan işler için revize isteyebilir (içerik ve talepler)
                </label>
                <p className="text-[11px] text-(--color-text-muted)">
                  İşaretsizse müşteri tamamlanan işi sadece onaylayabilir, revize isteyemez. Revize istekleri önce sana onaya gelir (Müşteri Talepleri).
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={metaOn} onChange={(e) => setMetaOn(e.target.checked)} className="h-4 w-4" />
                Meta reklam yönetimi (Facebook / Instagram)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={googleOn} onChange={(e) => setGoogleOn(e.target.checked)} className="h-4 w-4" />
                Google reklam yönetimi
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => saveClientAdServices({
                      clientId,
                      meta: metaOn,
                      google: googleOn,
                      social: socialOn,
                      contentEdit: contentEditOn,
                      shareRevision: revisionOn,
                    }),
                    "Hizmetler kaydedildi."
                  )
                }
                className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
              >
                Hizmetleri kaydet
              </button>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold">Ödeme bildirimleri</h3>
              <div>
                <label className={label}>Gecikmiş ödeme bildirimi</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as ClientNotifyMode)} className={input}>
                  {(Object.keys(NOTIFY_LABEL) as ClientNotifyMode[]).map((m) => (
                    <option key={m} value={m}>
                      {NOTIFY_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Aylık ödeme günü (1-28, boşsa sadece geçmiş aylar gecikmiş sayılır)</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className={input}
                />
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => saveClientNotifySettings({ clientId, notifyMode: mode, paymentDueDay: dueDay ? Number(dueDay) : null }),
                    "Bildirim ayarları kaydedildi."
                  )
                }
                className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
              >
                Ayarları kaydet
              </button>
            </section>

            {error && <p className="text-xs text-brand-600">{error}</p>}
            {info && <p className="text-xs text-emerald-700 dark:text-emerald-300">{info}</p>}
          </div>
        </div>
      </dialog>
    </>
  );
}
