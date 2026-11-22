"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Palette, RotateCcw, X } from "lucide-react";
import { setClientShareColor } from "@/lib/actions/sharePosts";
import { SHARE_COLORS } from "./palette";
import type { ShareClient } from "./types";

/** Müşteri başına takvim rengini seçtiren pencere (Google Takvim'deki renk seçici gibi). */
export function ShareColorSettings({ clients }: { clients: ShareClient[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Sunucudan yeni veri gelene kadar seçimi anında göstermek için yerel üzerine yazma.
  const [override, setOverride] = useState<Record<string, { color: string; custom: boolean }>>({});
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Renk seçici sürüklenirken sürekli kaydetmemek için kayıt kısa süre geciktirilir.
  const save = (clientId: string, color: string | null, fallback: string, delay = 0) => {
    setError(null);
    setOverride((o) => ({ ...o, [clientId]: { color: color ?? fallback, custom: color !== null } }));
    clearTimeout(timers.current[clientId]);
    timers.current[clientId] = setTimeout(() => persist(clientId, color), delay);
  };

  const persist = (clientId: string, color: string | null) => {
    startTransition(async () => {
      try {
        await setClientShareColor(clientId, color);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Renk kaydedilemedi.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted)"
      >
        <Palette size={14} />
        Müşteri renkleri
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        {open && (
          <div className="flex max-h-[88dvh] flex-col">
            <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
              <div>
                <h2 className="text-base font-bold">Müşteri renkleri</h2>
                <p className="text-[11px] text-(--color-text-muted)">
                  Takvimde her müşterinin paylaşımları seçtiğin renkle görünür.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>

            <ul className="min-h-0 flex-1 divide-y divide-(--color-border) overflow-y-auto">
              {clients.map((c) => {
                const current = override[c.id] ?? { color: c.color, custom: c.custom };
                return (
                  <li key={c.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: current.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                      {current.custom && (
                        <button
                          type="button"
                          onClick={() => save(c.id, null, c.color)}
                          title="Otomatik renge dön"
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                        >
                          <RotateCcw size={11} />
                          Otomatik
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SHARE_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => save(c.id, hex, c.color)}
                          aria-label={`${c.name} için ${hex} rengini seç`}
                          className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-1 ring-offset-(--color-surface) hover:ring-2 hover:ring-(--color-border)"
                          style={{ backgroundColor: hex }}
                        >
                          {current.custom && current.color.toLowerCase() === hex && (
                            <Check size={13} className="text-white drop-shadow" />
                          )}
                        </button>
                      ))}
                      <label
                        title="Kendi rengini seç"
                        className="ml-1 flex cursor-pointer items-center gap-1 rounded-full border border-(--color-border) px-2 py-0.5 text-[11px] text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                      >
                        <input
                          type="color"
                          value={current.color}
                          onChange={(e) => save(c.id, e.target.value, c.color, 500)}
                          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                        />
                        Özel
                      </label>
                    </div>
                  </li>
                );
              })}
              {clients.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-(--color-text-muted)">
                  Aktif müşteri yok.
                </li>
              )}
            </ul>

            {error && <p className="border-t border-(--color-border) px-4 py-2 text-xs text-brand-600">{error}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}
