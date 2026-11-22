"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/app/(app)/musteriler/actions";

export function NewClientModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Plus size={16} />
        Yeni Müşteri
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await createClient(formData);
                formRef.current?.reset();
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Bir hata oluştu.");
              }
            });
          }}
          className="p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Yeni Müşteri</h2>
            <button type="button" onClick={close} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Müşteri adı
              </label>
              <input
                name="name"
                required
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                İletişim (opsiyonel)
              </label>
              <input
                name="contact"
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Notlar (opsiyonel)
              </label>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>

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
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Ekleniyor..." : "Müşteriyi Ekle"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
