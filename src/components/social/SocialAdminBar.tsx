"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshSocial, setSocialClient, setSocialVisible } from "@/lib/actions/social";

const selectCls =
  "rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

export type AccountOption = { id: string; label: string };

/** Yönetici araç çubuğu: hesap ve dönem seçimi, şimdi yenile, müşteriye bağla, müşteri panelinde göster. */
export function SocialAdminBar({
  accounts,
  accountId,
  range,
  ranges,
  clientId,
  clients,
  visible,
  lastSync,
  lastError,
}: {
  accounts: AccountOption[];
  accountId: string;
  range: string;
  ranges: { key: string; label: string }[];
  clientId: string | null;
  clients: { id: string; name: string }[];
  visible: boolean;
  lastSync: string | null;
  lastError: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const go = (acc: string, r: string) => router.push(`/sosyal-medya?hesap=${acc}&range=${r}`);
  const run = (fn: () => Promise<unknown>, ok?: (r: unknown) => string) =>
    start(async () => {
      setMsg(null);
      try {
        const r = await fn();
        if (ok) setMsg(ok(r));
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "İşlem yapılamadı.");
      }
    });

  return (
    <div className="space-y-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-(--color-text-muted)">Müşteri:</span>
          <select value={accountId} onChange={(e) => go(e.target.value, range)} className={selectCls} aria-label="Müşteri">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex overflow-hidden rounded-lg border border-(--color-border)">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => go(accountId, r.key)}
              className={`px-3 py-2 text-xs font-semibold ${range === r.key ? "bg-brand-600 text-white" : "bg-(--color-bg) hover:bg-(--color-surface-muted)"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(refreshSocial, (r) => {
              const x = r as { synced: number; errors: string[] };
              return x.errors.length ? `Bazı hesaplarda hata: ${x.errors.join("; ")}` : `${x.synced} hesap güncellendi.`;
            })
          }
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-xs font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
        >
          <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
          {pending ? "Çekiliyor..." : "Şimdi yenile"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        {!clientId && (
          <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/10 dark:text-amber-300">
            <span className="font-semibold">Bu hesap hangi müşterinin?</span>
            <select
              value=""
              disabled={pending}
              onChange={(e) => e.target.value && run(() => setSocialClient(accountId, e.target.value))}
              className={`${selectCls} py-1.5 text-xs`}
            >
              <option value="">Müşteri seçin</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`flex items-center gap-2 ${clientId ? "" : "opacity-50"}`}>
          <input
            type="checkbox"
            checked={visible}
            disabled={pending || !clientId}
            onChange={(e) => run(() => setSocialVisible(accountId, e.target.checked))}
            className="h-4 w-4"
          />
          Müşteri panelinde &quot;Gelişim&quot; olarak göster
        </label>
        <span className="text-(--color-text-muted)">{lastSync ? `Son güncelleme: ${lastSync}` : "Henüz veri çekilmedi"}</span>
      </div>
      {msg && <p className="text-xs font-medium text-brand-600">{msg}</p>}
      {lastError && <p className="text-xs text-amber-700 dark:text-amber-300">Son hata: {lastError}</p>}
    </div>
  );
}
