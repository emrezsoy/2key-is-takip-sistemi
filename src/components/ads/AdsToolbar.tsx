"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncAdsNow } from "@/lib/actions/ads";
import { timeAgo } from "@/lib/format";

export const RANGE_OPTIONS = [
  { value: "7", label: "Son 7 gün" },
  { value: "30", label: "Son 30 gün" },
  { value: "90", label: "Son 90 gün" },
  { value: "ay", label: "Bu ay" },
  { value: "365", label: "Son 1 yıl" },
];

export function AdsToolbar({
  range,
  clientId,
  clients,
  canSync,
  lastSync,
}: {
  range: string;
  clientId: string;
  clients: { id: string; name: string }[];
  canSync: boolean;
  lastSync: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const go = (next: { range?: string; client?: string }) => {
    const params = new URLSearchParams({
      range: next.range ?? range,
      client: next.client ?? clientId,
    });
    router.push(`/reklam-paneli?${params.toString()}`);
  };

  const selectClass =
    "rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-sm outline-none focus:border-brand-500";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={clientId} onChange={(e) => go({ client: e.target.value })} className={selectClass}>
          <option value="all">Tüm müşteriler</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={range} onChange={(e) => go({ range: e.target.value })} className={selectClass}>
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {lastSync && (
            <span className="text-xs text-(--color-text-muted)">
              Son güncelleme: {timeAgo(lastSync)}
            </span>
          )}
          {canSync && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setMessage(null);
                  try {
                    const r = await syncAdsNow();
                    setMessage({
                      kind: "ok",
                      text: `${r.accounts} hesap, ${r.campaigns} kampanya güncellendi.`,
                    });
                    router.refresh();
                  } catch (e) {
                    setMessage({
                      kind: "error",
                      text: e instanceof Error ? e.message : "Güncellenemedi.",
                    });
                  }
                })
              }
              className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-60"
            >
              <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
              {pending ? "Güncelleniyor..." : "Şimdi güncelle"}
            </button>
          )}
        </div>
      </div>
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
  );
}
