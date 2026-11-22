"use client";

import { useRef } from "react";
import { Check, FileText, Upload, X } from "lucide-react";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { SERVICES } from "@/lib/proposals";

export const inputCls =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

/** Hizmet seçimi: her hizmetin yanında boş bir yuvarlak; birden fazlası aynı anda seçilebilir. "Özel" için açıklama alanı çıkar. */
export function ServicePicker({
  value,
  onChange,
  custom,
  onCustomChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  custom: string;
  onCustomChange: (v: string) => void;
}) {
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => {
          const checked = value.includes(s.key);
          return (
            <label key={s.key} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(s.key)} />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 ${
                  checked ? "border-brand-600 bg-brand-600" : "border-(--color-border) bg-(--color-bg)"
                }`}
              >
                {checked && <Check size={12} strokeWidth={3} className="text-white" />}
              </span>
              {s.label}
            </label>
          );
        })}
      </div>
      {value.includes("CUSTOM") && (
        <input
          type="text"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          maxLength={200}
          placeholder="Özel hizmetin içeriğini yazın (isteğe bağlı)"
          className={`${inputCls} mt-3`}
        />
      )}
    </div>
  );
}

/** Tek dosya seçimi: sürükle-bırak ya da "Dosya seç". */
export function FilePick({
  file,
  onFile,
  dropLabel = "Teklif dosyasını bırakın",
  disabled = false,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  dropLabel?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <FileDropZone
      disabled={disabled}
      label={dropLabel}
      className="rounded-lg"
      onFiles={(files) => onFile(files[0] ?? null)}
    >
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center ${
          file ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-(--color-border)"
        }`}
      >
        {file ? (
          <div className="flex max-w-full items-center gap-2 text-sm">
            <FileText size={18} className="shrink-0 text-emerald-600" />
            <span className="min-w-0 truncate font-medium">{file.name}</span>
            <span className="shrink-0 text-xs text-(--color-text-muted)">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            <button
              type="button"
              onClick={() => onFile(null)}
              disabled={disabled}
              aria-label="Dosyayı kaldır"
              className="shrink-0 rounded p-1 text-(--color-text-muted) hover:text-brand-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={20} className="text-(--color-text-muted)" />
            <p className="text-sm text-(--color-text-muted)">Dosyayı buraya sürükleyip bırakın ya da</p>
          </>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-xs font-semibold hover:bg-(--color-surface-muted) disabled:opacity-50"
        >
          {file ? "Başka dosya seç" : "Dosya seç"}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>
    </FileDropZone>
  );
}
