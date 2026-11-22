"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Unplug } from "lucide-react";
import {
  disconnectGoogle,
  restartGoogleAuth,
  setGoogleAccountClient,
  startGoogleAuth,
  syncGoogleNow,
} from "@/lib/actions/googleAds";

export type GoogleSetupAccount = {
  id: string;
  customerId: string;
  name: string;
  status: string | null;
  currency: string | null;
  clientId: string | null;
};

const fmtId = (id: string) => (id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id);

const inputCls =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

/** Admin'e özel Google Ads bağlantısı: OAuth istemcisi + yetkilendirme + hesap ↔ müşteri eşleştirme. */
export function GoogleAdsSetup({
  hasOAuth,
  connected,
  managerId,
  redirectUri,
  accounts,
  clients,
  flash,
}: {
  hasOAuth: boolean;
  connected: boolean;
  managerId: string | null;
  redirectUri: string;
  accounts: GoogleSetupAccount[];
  clients: { id: string; name: string }[];
  flash: { ok: boolean; text: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(!connected || !!flash);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [manager, setManager] = useState(managerId ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    flash ? { kind: flash.ok ? "ok" : "error", text: flash.text } : null
  );
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const run = (fn: () => Promise<string | void>) =>
    startTransition(async () => {
      setMessage(null);
      try {
        const text = await fn();
        if (text) setMessage({ kind: "ok", text });
        router.refresh();
      } catch (e) {
        setMessage({ kind: "error", text: e instanceof Error ? e.message : "İşlem yapılamadı." });
      }
    });

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface)">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-bold">
          <KeyRound size={15} />
          Google Ads bağlantısı ve hesap eşleştirme
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            connected
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          }`}
        >
          {connected ? "Bağlı" : "Bağlı değil"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-(--color-border) p-4">
          {!connected ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const url = await startGoogleAuth({ clientId, clientSecret, managerId: manager });
                  window.location.href = url;
                });
              }}
              className="space-y-3"
            >
              <p className="text-sm text-(--color-text-muted)">
                Google Cloud &rarr; Google Auth Platform &rarr; İstemciler &rarr; <strong>Sistem Google Ads</strong> istemcisinin
                kimliğini ve sırrını yapıştır. Sır şifrelenerek saklanır ve bir daha gösterilmez. Kaydedince Google yetkilendirme
                sayfasına yönlendirilirsin; <strong>yönetici hesaba erişimi olan Google hesabıyla</strong> izin ver.
              </p>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="İstemci kimliği (…apps.googleusercontent.com)" autoComplete="off" className={inputCls} />
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="İstemci sırrı"
                autoComplete="off"
                className={inputCls}
              />
              <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Yönetici (MCC) hesap numarası, ör. 607-510-3827" className={inputCls} />
              <p className="text-[11px] text-(--color-text-muted)">
                Yetkili yönlendirme adresi (istemcide tanımlı olmalı): <code>{redirectUri}</code>
              </p>
              <button
                type="submit"
                disabled={pending || !clientId.trim() || clientSecret.trim().length < 10 || manager.replace(/\D/g, "").length < 8}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {pending ? "Yönlendiriliyor..." : "Kaydet ve Google ile yetkilendir"}
              </button>
              {hasOAuth && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      window.location.href = await restartGoogleAuth();
                    })
                  }
                  className="ml-2 rounded-lg border border-(--color-border) px-4 py-2 text-sm font-semibold hover:bg-(--color-surface-muted)"
                >
                  Kayıtlı bilgilerle yetkilendir
                </button>
              )}
            </form>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-(--color-text-muted)">Google Ads hesapları</p>
                <ul className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-[11px] text-(--color-text-muted)">
                          {fmtId(a.customerId)}
                          {a.status && ` · ${a.status}`}
                          {a.currency && ` · ${a.currency}`}
                        </p>
                      </div>
                      <select
                        value={a.clientId ?? ""}
                        disabled={pending}
                        onChange={(e) => run(() => setGoogleAccountClient(a.id, e.target.value || null) as Promise<void>)}
                        aria-label={`${a.name} hesabının müşterisi`}
                        className="rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm"
                      >
                        <option value="">Müşteri seçilmedi</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                  {accounts.length === 0 && (
                    <li className="px-3 py-4 text-center text-sm text-(--color-text-muted)">Henüz hesap yok. &ldquo;Şimdi güncelle&rdquo; ile verileri çek.</li>
                  )}
                </ul>
                <p className="mt-2 text-[11px] text-(--color-text-muted)">
                  Hesabı müşteriye bağlayınca müşterinin panelinde (Google reklam yönetimi işaretliyse) görünür.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await syncGoogleNow();
                      return `Güncellendi: ${r.accounts} hesap, ${r.campaigns} kampanya.`;
                    })
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
                >
                  <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
                  Şimdi güncelle
                </button>
                {confirmingDisconnect ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-(--color-text-muted)">Bağlantı kaldırılsın mı? (Kayıtlı veriler silinmez)</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await disconnectGoogle();
                          setConfirmingDisconnect(false);
                        })
                      }
                      className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                    >
                      Evet, kaldır
                    </button>
                    <button type="button" onClick={() => setConfirmingDisconnect(false)} className="rounded px-2 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)">
                      Vazgeç
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDisconnect(true)}
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                  >
                    <Unplug size={13} />
                    Bağlantıyı kaldır
                  </button>
                )}
              </div>
            </>
          )}

          {message && (
            <p className={`text-xs ${message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-brand-600"}`}>{message.text}</p>
          )}
        </div>
      )}
    </section>
  );
}
