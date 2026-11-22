"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { UrgencyPicker } from "./UrgencyPicker";
import { ReferenceFilesField } from "./ReferenceFilesField";

export function NewJobDialog({
  target,
  onClose,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const up = useUploader();

  useEffect(() => {
    if (target) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [target]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="w-full max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
    >
      <form
        key={target?.id ?? "none"}
        ref={formRef}
        action={(formData) => {
          if (!target) return;
          setError(null);
          startTransition(async () => {
            try {
              await up.run("createClientJob", [target.id], formData);
              formRef.current?.reset();
              handleClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Bir hata oluştu.");
            }
          });
        }}
        className="p-5"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Yeni İş</h2>
          <button type="button" onClick={handleClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-(--color-text-muted)">{target?.name}</p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
              İş
            </label>
            <textarea
              name="text"
              required
              autoFocus
              rows={4}
              maxLength={2000}
              placeholder="İşi bir cümle ya da paragraf olarak yaz..."
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
              Aciliyet
            </label>
            <UrgencyPicker />
          </div>

          <UploadBar progress={up.progress} label="Dosyalar yükleniyor" />
          <ReferenceFilesField
            label="Referans dosyaları / kullanılacak görseller (opsiyonel)"
            hint="Birden fazla görsel veya dosya ekleyebilirsin. İşi alan kişi görür; paylaşım takvimine gitmez."
          />

          <details className="group rounded-lg border border-(--color-border) px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-(--color-text-muted)">
              Ek ayarlar (opsiyonel)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Teslim süresi (işi alan kişiye verildiği andan başlar)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    name="durationValue"
                    placeholder="Süre yok"
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                  />
                  <select
                    name="durationUnit"
                    className="rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm"
                  >
                    <option value="DAY">gün</option>
                    <option value="HOUR">saat</option>
                  </select>
                </div>
              </div>
            </div>
          </details>
        </div>

        {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="hidden text-[11px] text-(--color-text-muted) sm:block">
            Ctrl + Enter ile kaydet
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Ekleniyor..." : "İşi Ekle"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
