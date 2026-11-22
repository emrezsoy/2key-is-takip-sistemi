"use client";

import { useRef, useState, type ReactNode } from "react";

/** İçindeki alana dosya sürükleyip bırakmayı sağlar: sürüklerken çerçeve ve ipucu çıkar, bırakınca `onFiles` çalışır.
 * `disabled` iken bırakılan dosya yok sayılır (tarayıcı dosyayı açmaz). */
export function FileDropZone({
  onFiles,
  disabled = false,
  label = "Dosyaları buraya bırakın",
  className = "",
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  // dragenter/dragleave alt öğelere girip çıkarken tekrar tetiklenir; sayaçla titremeyi önleriz.
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types ?? []).includes("Files");

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (disabled || !hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-brand-500 bg-brand-50/85 px-2 text-center text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
          {label}
        </div>
      )}
    </div>
  );
}
