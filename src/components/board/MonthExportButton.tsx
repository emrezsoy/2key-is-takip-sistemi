"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, FolderArchive, X } from "lucide-react";
import { MONTHS } from "@/lib/format";
import { previewMonthExport, type MonthExportPreview } from "@/lib/actions/monthExport";

/** Müşteri kutusundaki "Toplu indir": ay seçilir, o ay tamamlanan işlerin teslim dosyaları klasörlü tek zip olarak iner. */
export function MonthExportButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [preview, setPreview] = useState<MonthExportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  // Ay değişince (ve pencere açılınca) o ayda neler indirileceğini göster.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startLoad(async () => {
      try {
        const res = await previewMonthExport(clientId, year, month);
        if (!cancelled) {
          setPreview(res);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPreview(null);
          setError(e instanceof Error ? e.message : "Liste alınamadı.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, clientId, year, month]);

  const href = `/api/clients/${clientId}/export?year=${year}&month=${month}`;
  const empty = !!preview && preview.jobs.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bir ayda tamamlanan işlerin dosyalarını klasörlü zip olarak indir"
        className="flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs font-medium text-(--color-text-muted) transition-colors hover:border-brand-500 hover:text-brand-600"
      >
        <FolderArchive size={14} />
        Toplu indir
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        {open && (
          <div className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Toplu indir</h2>
                <p className="text-xs text-(--color-text-muted)">{clientName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>

            <p className="mb-3 text-xs text-(--color-text-muted)">
              Seçtiğin ayda tamamlanan işlerin teslim dosyaları tek bir zip olarak iner. Her iş, başlığının adıyla bir klasör olur;
              kaydırmalı postlarda tüm sayfalar o klasörün içinde sırasıyla yer alır.
            </p>

            <div className="mb-3 flex gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Ay"
                className="min-w-0 flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Yıl"
                className="w-28 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-surface-muted) p-3 text-xs">
              {loading && <p className="text-(--color-text-muted)">Liste hazırlanıyor...</p>}
              {!loading && error && <p className="text-brand-600">{error}</p>}
              {!loading && !error && empty && (
                <p className="text-(--color-text-muted)">
                  {MONTHS[month - 1]} {year} ayında tamamlanan ve teslim dosyası olan iş yok.
                </p>
              )}
              {!loading && !error && preview && preview.jobs.length > 0 && (
                <>
                  <p className="mb-2 font-semibold">
                    {preview.jobs.length} iş, {preview.totalFiles} dosya
                  </p>
                  <ul className="space-y-1">
                    {preview.jobs.map((j) => (
                      <li key={j.folder} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words">📁 {j.folder}</span>
                        <span className="shrink-0 text-(--color-text-muted)">{j.fileCount} dosya</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
              >
                Kapat
              </button>
              {loading || error || empty || !preview ? (
                <span className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white opacity-50">
                  <Download size={14} />
                  İndir
                </span>
              ) : (
                <a
                  href={href}
                  download
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <Download size={14} />
                  İndir (.zip)
                </a>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
