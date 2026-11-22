"use client";

import { Loader2 } from "lucide-react";
import { percentOf, type UploadProgress } from "@/lib/useUploader";

const sizeText = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Yükleme çubuğu: yüzde ve aktarılan boyut. Dosya sunucuya ulaşınca "Kaydediliyor" durumuna geçer
 * (büyük dosyalarda Drive'a aktarım birkaç saniye sürebilir). `progress` boşsa hiçbir şey göstermez. */
export function UploadBar({
  progress,
  label = "Yükleniyor",
  className = "",
}: {
  progress: UploadProgress | null;
  label?: string;
  className?: string;
}) {
  if (!progress) return null;
  const processing = progress.phase === "processing";
  const pct = processing ? 100 : percentOf(progress);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`rounded-lg border border-(--color-border) bg-(--color-surface-muted) p-2.5 ${className}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="flex min-w-0 items-center gap-1.5">
          <Loader2 size={13} className="shrink-0 animate-spin text-brand-600" />
          <span className="truncate">{processing ? "Kaydediliyor, lütfen bekleyin..." : `${label}...`}</span>
        </span>
        <span className="shrink-0 tabular-nums text-brand-600">%{pct}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-(--color-border)">
        <div
          className={`h-full rounded-full bg-brand-600 transition-[width] duration-200 ${processing ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!processing && progress.total > 1 && (
        <p className="mt-1 text-[10px] text-(--color-text-muted)">
          {sizeText(progress.loaded)} / {sizeText(progress.total)}
        </p>
      )}
    </div>
  );
}
