"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ImagePlus, X } from "lucide-react";

const MAX_FILES = 20;
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const sizeText = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** İş formlarında referans / kullanılacak dosya alanı: birden çok dosya, sürükle-bırak, yapıştır, görsel önizleme.
 * Dosyalar normal form alanı olarak ("files") gönderilir. */
export function ReferenceFilesField({ label = "Referans dosyaları", hint }: { label?: string; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const previews = useMemo(() => files.map((f) => (IMAGE.test(f.name) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const apply = (list: File[]) => {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    list.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    setFiles(list);
  };

  const add = (incoming: File[]) => {
    const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const seen = new Set(files.map(key));
    const merged = [...files, ...incoming.filter((f) => !seen.has(key(f)))];
    if (merged.length > MAX_FILES) setNote(`En fazla ${MAX_FILES} dosya eklenebilir.`);
    else setNote(null);
    apply(merged.slice(0, MAX_FILES));
  };

  // Form sıfırlanınca (iş eklendikten sonra) liste de temizlensin.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setFiles([]);
      setNote(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(Array.from(e.dataTransfer.files));
        }}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData.files);
          if (pasted.length > 0) {
            e.preventDefault();
            add(pasted);
          }
        }}
        tabIndex={0}
        className={`rounded-lg border border-dashed p-3 outline-none focus:border-brand-500 ${
          over ? "border-brand-500 bg-brand-50 dark:bg-brand-900/10" : "border-(--color-border)"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          className="hidden"
          onChange={(e) => {
            // Seçim penceresi her seferinde yeni listeyi verir; mevcut listeyle birleştirip alanı yeniden kuruyoruz.
            const picked = Array.from(e.target.files ?? []);
            const prev = files;
            const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
            const seen = new Set(prev.map(key));
            const merged = [...prev, ...picked.filter((f) => !seen.has(key(f)))].slice(0, MAX_FILES);
            apply(merged);
            if (prev.length + picked.length > MAX_FILES) setNote(`En fazla ${MAX_FILES} dosya eklenebilir.`);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm font-medium text-(--color-text-muted) hover:text-brand-600"
        >
          <ImagePlus size={16} />
          Dosya seç, sürükleyip bırak ya da yapıştır
        </button>
        {hint && <p className="text-center text-[11px] text-(--color-text-muted)">{hint}</p>}

        {files.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="relative flex items-center gap-2 rounded-lg border border-(--color-border) p-1.5">
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[i]!} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-(--color-surface-muted) text-(--color-text-muted)">
                    <FileText size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{f.name}</span>
                  <span className="block text-[10px] text-(--color-text-muted)">{sizeText(f.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`${f.name} dosyasını çıkar`}
                  onClick={() => apply(files.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-full p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {note && <p className="mt-1 text-xs text-brand-600">{note}</p>}
    </div>
  );
}
