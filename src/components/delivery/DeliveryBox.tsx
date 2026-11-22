"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Download, Eye, Film, PenLine, Trash2, Undo2, X } from "lucide-react";
import { downloadHref } from "@/components/ui/MediaLightbox";
import { deleteDeliveryFiles } from "@/lib/actions/fileRemoval";
import { approveDelivery, clearDelivery, type DeliveryTarget } from "@/lib/actions/deliveries";
import { useUploader } from "@/lib/useUploader";
import { RevisionEditor } from "./RevisionEditor";

export type DeliveryFileRow = { id: string; url: string; name: string; mediaType: "IMAGE" | "VIDEO" };
export type DeliveryStatus = "REVIEW" | "APPROVED" | "REVISION";
export type DeliveryInfo = {
  status: DeliveryStatus;
  files: DeliveryFileRow[];
  deliveredAt: string | null;
  deliveredByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  REVIEW: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REVISION: "Revize istendi",
};
export const DELIVERY_STATUS_STYLE: Record<DeliveryStatus, string> = {
  REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  REVISION: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

const shortDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso))
    : "";

/** Tamamlanan işin çıktısı: görsel/videolar + durum. Müşteri onay verir ya da revize ister; ekip yanlış gönderileni kaldırabilir. */
export function DeliveryBox({
  target,
  delivery,
  title,
  subtitle,
  canReview = false,
  canRevise = false,
  canClear = false,
  canTeamRevise = false,
  reviewOnThumbClick = false,
  extra,
  emptyText = "Henüz tamamlanmadı",
}: {
  target: DeliveryTarget;
  delivery: DeliveryInfo | null;
  title: string;
  subtitle?: string;
  /** Müşteri paneli: onaylayabilir. */
  canReview?: boolean;
  /** Müşteri paneli: revize isteyebilir (müşteri bazında yetki). */
  canRevise?: boolean;
  /** Ekip: yanlış gönderilen teslimi kaldırabilir. */
  canClear?: boolean;
  /** Ekip (içerik listesi): teslim üzerine çizip not yazarak revize verebilir; iş kartına geri döner. */
  canTeamRevise?: boolean;
  /** Onay bekleyen teslimde küçük görsele dokunmak da inceleme penceresini açar. */
  reviewOnThumbClick?: boolean;
  /** Ekip tarafında duruma göre ek düğmeler (ör. "Paylaşım takvimine gönder"). */
  extra?: ReactNode;
  emptyText?: string;
}) {
  const router = useRouter();
  const reviewRef = useRef<HTMLDialogElement>(null);
  // Müşteri incelemesi: "review" = görseller + onayla / revize iste düğmeleri, "revise" = çizim ekranı.
  const [mode, setMode] = useState<"review" | "revise" | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const up = useUploader();
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const d = reviewRef.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    else if (!mode && d.open) d.close();
  }, [mode]);

  if (!delivery) {
    return <span className="px-2 text-xs italic text-(--color-text-muted)">{emptyText}</span>;
  }

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
      }
    });
  };

  const { status, files } = delivery;
  const when = status === "REVIEW" ? shortDate(delivery.deliveredAt) : shortDate(delivery.reviewedAt ?? delivery.deliveredAt);
  const who = status === "REVIEW" ? delivery.deliveredByName : delivery.reviewedByName;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {files.map((f, i) => (
          <div key={f.id} className="relative">
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            title={f.name}
            onClick={(e) => {
              // İçerik tablosu (müşteri): görsele dokunmak "İncele" ile aynı pencereyi açar.
              if (reviewOnThumbClick && canReview && status === "REVIEW") {
                e.preventDefault();
                setError(null);
                setViewIndex(i);
                setMode("review");
              }
            }}
            className="relative block h-24 w-[4.8rem] overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface-muted)"
          >
            {f.mediaType === "VIDEO" ? (
              <video src={`${f.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
            )}
            {files.length > 1 && (
              <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">{i + 1}</span>
            )}
            {f.mediaType === "VIDEO" && (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 p-0.5 text-white">
                <Film size={10} />
              </span>
            )}
          </a>
          {canClear && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`"${f.name}" teslimden silinsin mi?`)) run(() => deleteDeliveryFiles(target, [f.id]).then(() => undefined));
              }}
              aria-label={`${f.name} dosyasını sil`}
              title="Bu dosyayı sil"
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <Trash2 size={10} />
            </button>
          )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DELIVERY_STATUS_STYLE[status]}`}>
          {DELIVERY_STATUS_LABEL[status]}
        </span>
        {(when || who) && (
          <span className="text-[10px] text-(--color-text-muted)">
            {when}
            {who ? ` · ${who}` : ""}
          </span>
        )}
      </div>

      {canReview && status === "REVIEW" && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setViewIndex(0);
              setMode("review");
            }}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Eye size={13} />
            İncele
          </button>
        </div>
      )}
      {canReview && status === "REVISION" && (
        <p className="text-[11px] text-(--color-text-muted)">Bu çalışma revize ediliyor; hazır olunca burada görünecek.</p>
      )}

      {(extra || canClear || canTeamRevise) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {extra}
          {canTeamRevise && status !== "REVISION" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMode("revise");
              }}
              title="Görselin üzerine çizip not yazarak revize ver; iş kartına geri döner"
              className="flex items-center gap-1 rounded-lg border border-violet-400 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60 dark:text-violet-300 dark:hover:bg-violet-900/20"
            >
              <PenLine size={13} />
              Revize ver
            </button>
          )}
          {canClear && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Bu teslim \"Tamamlanan\" sütunundan kaldırılsın mı?")) run(() => clearDelivery(target));
              }}
              title="Yanlış gönderilen teslimi kaldır"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-(--color-text-muted) hover:text-brand-600"
            >
              <Undo2 size={11} />
              Teslimi kaldır
            </button>
          )}
        </div>
      )}
      {error && <p className="text-[11px] text-brand-600">{error}</p>}

      {(canReview || canTeamRevise) && (
        <dialog
          ref={reviewRef}
          onClose={() => setMode(null)}
          // Yanlışlıkla kapanmasın: inceleme penceresi boşluğa dokunmayla kapanmaz, çizim ekranı onay sorar.
          {...(mode === "revise" ? { "data-confirm-close": "" } : { "data-no-backdrop-close": "" })}
          className="m-auto w-[calc(100%-1.5rem)] max-w-3xl rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/60"
        >
          {mode === "revise" && (canRevise || canTeamRevise) && (
            <RevisionEditor
              title={title}
              subtitle={subtitle}
              images={files.map((f) => ({ id: f.id, url: f.url, mediaType: f.mediaType }))}
              progress={up.progress}
              team={canTeamRevise}
              submit={async (fd) => {
                if (canTeamRevise) await up.run("teamReviseDelivery", [target.id], fd);
                else await up.run("reviseDelivery", [target], fd);
              }}
              onClose={() => {
                setMode(null);
                router.refresh();
              }}
            />
          )}
          {mode === "review" && (() => {
            const many = files.length > 1;
            const cur = files[Math.min(viewIndex, files.length - 1)];
            const step = (dir: 1 | -1) => setViewIndex((i) => (i + dir + files.length) % files.length);
            return (
              <div className="flex max-h-[94dvh] flex-col">
                <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold leading-snug">Çalışmayı incele</h2>
                    <p className="truncate text-xs text-(--color-text-muted)">
                      {title}
                      {subtitle ? ` · ${subtitle}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => setMode(null)} aria-label="Kapat" className="shrink-0">
                    <X size={18} />
                  </button>
                </div>

                <div
                  className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/90 p-2"
                  onTouchStart={(e) => {
                    touchX.current = e.touches.length === 1 ? e.touches[0].clientX : null;
                  }}
                  onTouchEnd={(e) => {
                    const start = touchX.current;
                    touchX.current = null;
                    if (start === null || !many) return;
                    const dx = e.changedTouches[0].clientX - start;
                    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
                  }}
                >
                  {cur.mediaType === "VIDEO" ? (
                    <video key={cur.id} src={cur.url} controls playsInline className="max-h-[58dvh] max-w-full rounded" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={cur.id} src={cur.url} alt={cur.name} className="max-h-[58dvh] max-w-full rounded object-contain" />
                  )}
                  <a
                    href={downloadHref(cur.url)}
                    download={cur.name || true}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-black/80"
                  >
                    <Download size={14} />
                    İndir
                  </a>
                  {many && (
                    <>
                      <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label="Önceki"
                        className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 hover:bg-black/80"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label="Sonraki"
                        className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 hover:bg-black/80"
                      >
                        <ChevronRight size={22} />
                      </button>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                        {Math.min(viewIndex, files.length - 1) + 1} / {files.length}
                      </span>
                    </>
                  )}
                </div>

                <div className="space-y-2 border-t border-(--color-border) p-4">
                  {error && <p className="text-xs text-brand-600">{error}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await approveDelivery(target);
                          setMode(null);
                        })
                      }
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:flex-none"
                    >
                      <Check size={16} />
                      {pending ? "Kaydediliyor..." : "Onayla"}
                    </button>
                    {canRevise && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setMode("revise")}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-60 sm:flex-none dark:hover:bg-brand-900/10"
                      >
                        <PenLine size={16} />
                        Revize iste
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMode(null)}
                      disabled={pending}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </dialog>
      )}
    </div>
  );
}
