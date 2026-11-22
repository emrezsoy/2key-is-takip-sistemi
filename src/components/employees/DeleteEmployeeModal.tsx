"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { deleteEmployee } from "@/app/(app)/calisanlar/actions";

const REASON_PRESETS = ["İşten ayrılış", "Stajı bitti", "Sözleşme sona erdi"];

export function DeleteEmployeeModal({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const close = () => {
    dialogRef.current?.close();
    setReason("");
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Sil"
        className="rounded p-1.5 text-(--color-text-muted) hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
      >
        <Trash2 size={14} />
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Çalışanı Sil</h2>
            <button type="button" onClick={close} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          <p className="mb-3 text-sm text-(--color-text-muted)">
            <span className="font-semibold text-(--color-text)">{fullName}</span> silinecek.
            Kayıtları (görev, puantaj geçmişi) korunur ama listede görünmez.
          </p>

          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
            Silme sebebi
          </label>
          <input
            list="delete-reason-presets"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn. işten ayrılış, stajı bitti..."
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <datalist id="delete-reason-presets">
            {REASON_PRESETS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>

          {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await deleteEmployee(userId, reason);
                    close();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Bir hata oluştu.");
                  }
                });
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
