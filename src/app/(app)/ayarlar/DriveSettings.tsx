"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HardDrive } from "lucide-react";
import { checkDrive, connectDrive, disconnectDrive } from "@/lib/actions/drive";

export function DriveSettings({
  connected,
  defaultRootId,
  fileCount,
}: {
  connected: boolean;
  defaultRootId: string;
  fileCount: number;
}) {
  const router = useRouter();
  const [json, setJson] = useState("");
  const [rootId, setRootId] = useState(defaultRootId);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  const inputClass =
    "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <HardDrive size={15} />
          Dosya depolama: Google Drive
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            connected
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          }`}
        >
          {connected ? "Bağlı" : "Bağlı değil"}
        </span>
      </div>

      {connected ? (
        <div className="space-y-3">
          <p className="text-sm text-(--color-text-muted)">
            Yeni yüklenen dosyalar Ortak Drive&apos;da <strong>Müşteri / Ay Yıl</strong> klasörüne kaydediliyor
            (ör. Dynamic HR / Kasım 2026). Şimdiye kadar Drive&apos;a {fileCount} dosya yüklendi.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await checkDrive();
                  return `Bağlantı çalışıyor: "${r.driveName}" (${r.email})`;
                })
              }
              className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-60"
            >
              <CheckCircle2 size={13} />
              {pending ? "Sınanıyor..." : "Bağlantıyı sına"}
            </button>
            {confirming ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-(--color-text-muted)">
                  Kaldırılsın mı? (Drive&apos;daki dosyalar silinmez)
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await disconnectDrive();
                      setConfirming(false);
                    })
                  }
                  className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                >
                  Evet, kaldır
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded px-2 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                >
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded px-2 py-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
              >
                Bağlantıyı kaldır
              </button>
            )}
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await connectDrive(json, rootId);
              setJson("");
              return `Bağlandı: "${r.driveName}" Ortak Drive'ı (${r.email}).`;
            });
          }}
          className="space-y-3"
        >
          <p className="text-sm text-(--color-text-muted)">
            Google Cloud&apos;dan indirdiğin servis hesabı anahtar dosyasının (.json) <strong>tüm içeriğini</strong>{" "}
            aşağıya yapıştır. Anahtar şifrelenerek saklanır ve bir daha gösterilmez. Bitince dosyayı bilgisayarından sil.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Ortak Drive kimliği</label>
            <input value={rootId} onChange={(e) => setRootId(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Anahtar (JSON)</label>
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={6}
              spellCheck={false}
              autoComplete="off"
              placeholder='{ "type": "service_account", ... }'
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          </div>
          <button
            type="submit"
            disabled={pending || json.trim().length < 50}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Bağlanıyor..." : "Bağlan ve sına"}
          </button>
        </form>
      )}

      {message && (
        <p
          className={`mt-3 text-xs ${
            message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-brand-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
