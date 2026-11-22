"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { FileDropZone } from "@/components/ui/FileDropZone";

const inputClass =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-(--color-text-muted)";

export function RequestForm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const up = useUploader();
  const [sent, setSent] = useState(false);

  const close = () => dialogRef.current?.close();

  // Sürüklenen dosyaları seçili olanlara ekler (en fazla 10).
  const addDropped = (incoming: File[]) => {
    const input = fileRef.current;
    if (!input) return;
    const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const existing = Array.from(input.files ?? []);
    const seen = new Set(existing.map(key));
    const merged = [...existing, ...incoming.filter((f) => !seen.has(key(f)))].slice(0, 10);
    const dt = new DataTransfer();
    merged.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    setFileCount(merged.length);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSent(false);
          dialogRef.current?.showModal();
        }}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Plus size={16} />
        Yeni talep
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await up.run("createClientRequest", [], formData);
                formRef.current?.reset();
                setFileCount(0);
                setSent(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Talep gönderilemedi.");
              }
            });
          }}
          className="flex max-h-[92dvh] flex-col"
        >
          <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
            <h2 className="text-base font-bold">Yeni İş Talebi</h2>
            <button type="button" onClick={close} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          {sent ? (
            <div className="space-y-3 p-5">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Talebiniz iletildi.</p>
              <p className="text-sm text-(--color-text-muted)">
                Ekibimiz inceleyip onayladığında iş listemize alınır; durumunu buradan takip edebilirsiniz.
              </p>
              <button type="button" onClick={close} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Tamam
              </button>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                <div>
                  <label className={labelClass}>Başlık</label>
                  <input name="title" required maxLength={120} className={inputClass} placeholder="Örn. Kasım kampanyası afişi" />
                </div>
                <div>
                  <label className={labelClass}>İş detayı</label>
                  <textarea name="details" rows={5} maxLength={4000} className={inputClass} placeholder="Ne istediğinizi detaylıca anlatın..." />
                </div>
                <div>
                  <label className={labelClass}>Referans görseller / videolar (opsiyonel, en fazla 10)</label>
                  <UploadBar progress={up.progress} label="Dosyalar yükleniyor" className="mb-2" />
                  <FileDropZone onFiles={addDropped} className="rounded-lg" label="Dosyaları bırakın">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-(--color-border) px-3 py-2.5 text-sm text-(--color-text-muted) hover:bg-(--color-surface-muted)">
                    <ImagePlus size={16} />
                    <span className="min-w-0 truncate">{fileCount > 0 ? `${fileCount} dosya seçildi` : "Dosya seç ya da sürükleyip bırak (birden çok olabilir)"}</span>
                    <input
                      ref={fileRef}
                      name="files"
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                      className="sr-only"
                      onChange={(e) => setFileCount(e.target.files?.length ?? 0)}
                    />
                  </label>
                  </FileDropZone>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Aciliyet</label>
                    <select name="urgency" defaultValue="MEDIUM" className={inputClass}>
                      <option value="LOW">Düşük</option>
                      <option value="MEDIUM">Orta</option>
                      <option value="HIGH">Yüksek</option>
                      <option value="URGENT">Acil</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Not (opsiyonel)</label>
                  <textarea name="note" rows={2} maxLength={2000} className={inputClass} />
                </div>
                {error && <p className="text-xs text-brand-600">{error}</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-(--color-border) p-4">
                <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)">
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {pending ? "Gönderiliyor..." : "Talebi gönder"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
