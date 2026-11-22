"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2, Unplug } from "lucide-react";
import { connectMeta, disconnectMeta, setAdAccountClient } from "@/lib/actions/ads";

export type SetupAccount = {
  id: string;
  metaId: string;
  name: string;
  status: number | null;
  clientId: string | null;
};

const STATUS_TEXT: Record<number, string> = {
  1: "Aktif",
  2: "Devre dışı",
  3: "Ödeme sorunu",
  7: "İnceleme bekliyor",
  9: "Ek süre",
  101: "Kapalı",
};

/** Admin'e özel bağlantı ayarı: Meta anahtarı + reklam hesabı ↔ müşteri eşleştirme. */
export function AdsSetup({
  connected,
  accounts,
  clients,
}: {
  connected: boolean;
  accounts: SetupAccount[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [open, setOpen] = useState(!connected);

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <Link2 size={15} />
          Meta bağlantısı ve hesap eşleştirme
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
                  const r = await connectMeta(token);
                  setToken("");
                  return `Bağlandı: ${r.accounts} reklam hesabı, ${r.campaigns} kampanya alındı.`;
                });
              }}
              className="space-y-3"
            >
              <p className="text-sm text-(--color-text-muted)">
                Meta Business Suite &rarr; Sistem kullanıcıları &rarr; <strong>PanelReadOnly</strong> &rarr;
                &ldquo;Jeton oluştur&rdquo; ile üretilen anahtarı buraya yapıştır. Reklam ve sosyal medya verileri için{" "}
                <strong>ads_read, instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement, read_insights</strong>;
                Paylaşım Takvimi&apos;nden otomatik paylaşım için ayrıca <strong>instagram_content_publish</strong> ve{" "}
                <strong>pages_manage_posts</strong> izinleri seçili olmalı. Anahtar şifrelenerek saklanır ve bir daha gösterilmez.
              </p>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-60 flex-1">
                  <KeyRound
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)"
                  />
                  <input
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Meta erişim anahtarı"
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pending || token.trim().length < 20}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {pending ? "Bağlanıyor... (1 dakika sürebilir)" : "Bağlan ve verileri çek"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-(--color-text-muted)">
                  Reklam hesapları
                </p>
                <ul className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-[11px] text-(--color-text-muted)">
                          {a.metaId}
                          {a.status != null && ` · ${STATUS_TEXT[a.status] ?? `Durum ${a.status}`}`}
                        </p>
                      </div>
                      <select
                        value={a.clientId ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          run(() => setAdAccountClient(a.id, e.target.value || null) as Promise<void>)
                        }
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
                    <li className="px-3 py-4 text-center text-sm text-(--color-text-muted)">
                      Henüz hesap yok. &ldquo;Şimdi güncelle&rdquo; ile verileri çek.
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-[11px] text-(--color-text-muted)">
                  Aynı müşteriye birden çok hesap bağlayabilirsin; grafikler toplam olarak gösterilir.
                </p>
              </div>

              <div className="flex items-center justify-end">
                {confirmingDisconnect ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-(--color-text-muted)">
                      Bağlantı kaldırılsın mı? (Kayıtlı veriler silinmez)
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await disconnectMeta();
                          setConfirmingDisconnect(false);
                        })
                      }
                      className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                    >
                      Evet, kaldır
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDisconnect(false)}
                      className="rounded px-2 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                    >
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
            <p
              className={`text-xs ${
                message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-brand-600"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
