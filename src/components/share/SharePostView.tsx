"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, CalendarX2, Check, Download, ExternalLink, Loader2, Pencil, Trash2, X } from "lucide-react";
import { deleteSharePost, setShareStatus } from "@/lib/actions/sharePosts";
import { scheduleSharePostOnMeta, unscheduleSharePostFromMeta } from "@/lib/actions/metaSchedule";
import { metaAccessWarning, metaScheduleProblems } from "@/lib/metaScheduleRules";
import { SHARE_KIND_LABEL } from "@/lib/shareTime";
import { textOn } from "./palette";
import type { SharePostRow } from "./types";

export const formatShareDate = (date: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Eski tarayıcı / izin yok: geçici textarea ile kopyala.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Metin panoya kopyalanamadı.");
}

function triggerDownload(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
}

const slug = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9ğüşıöç]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "paylasim";

type Preloaded = { blob: Blob; blobUrl: string; fileName: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ViewContent({
  post,
  canEdit,
  viewOnly,
  canMark,
  onClose,
  onEdit,
}: {
  post: SharePostRow;
  canEdit: boolean;
  viewOnly: boolean;
  canMark: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const preloaded = useRef<Preloaded[]>([]);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [slide, setSlide] = useState(0);
  const [pending, startTransition] = useTransition();
  const [metaPending, startMeta] = useTransition();
  const images = post.images;

  // Meta'da planlama durumu.
  const metaLocked = post.metaStatus === "SCHEDULED" || post.metaStatus === "PUBLISHING";
  const legacyScheduled = post.metaScheduled && post.metaStatus === null && !post.published;
  const scheduled = post.metaStatus === "SCHEDULED" || legacyScheduled;
  const autoPublished = post.metaStatus === "PUBLISHED" || post.metaStatus === "PARTIAL";
  const metaProblems = scheduled || post.published ? [] : metaScheduleProblems(post);
  // Meta hesabı bağlı değil / paylaşım yetkisi yok: planlama kapalıdır, paylaşım elle yapılır.
  const accessWarning = metaAccessWarning(post.metaAccess);

  const scheduleOnMeta = () =>
    startMeta(async () => {
      setStatus(null);
      try {
        const t = await scheduleSharePostOnMeta(post.id);
        if (!t.ok) return setStatus({ kind: "error", text: t.error });
        const where = [t.instagram ? `Instagram (@${t.instagram})` : null, `Facebook (${t.page})`].filter(Boolean).join(" ve ");
        setStatus({ kind: "ok", text: `Meta'da planlandı: ${post.time} saatinde ${where} üzerinde otomatik paylaşılacak.` });
      } catch (err) {
        setStatus({ kind: "error", text: err instanceof Error ? err.message : "Planlanamadı." });
      }
    });
  const unscheduleFromMeta = () =>
    startMeta(async () => {
      setStatus(null);
      try {
        const r = await unscheduleSharePostFromMeta(post.id);
        if (!r.ok) return setStatus({ kind: "error", text: r.error });
        setStatus({
          kind: "ok",
          text: r.legacy
            ? "İşaret kaldırıldı. Meta Business Suite'te elle planladıysan oradaki planı da ayrıca kaldırman gerekir."
            : "Planlamadan kaldırıldı; artık otomatik paylaşılmayacak ve düzenlenebilir.",
        });
      } catch (err) {
        setStatus({ kind: "error", text: err instanceof Error ? err.message : "Kaldırılamadı." });
      }
    });
  const count = images.length;

  const nameFor = (i: number) => {
    const item = images[i];
    const ext = item.name?.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? (item.mediaType === "VIDEO" ? ".mp4" : ".png");
    return `${slug(post.clientName)}-${post.date}${count > 1 ? `-${i + 1}` : ""}${ext}`;
  };

  // Görselleri önceden indirip hazır tutar: butona basıldığı an indirme/paylaşım beklemeden başlar
  // (mobil tarayıcılar kullanıcı dokunuşundan sonra geciken indirmeleri engelleyebiliyor).
  const imageKey = images.map((i) => i.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    preloaded.current = [];
    images.forEach((img, i) => {
      // Videolar büyük olabilir: önceden belleğe alınmaz, doğrudan adresten indirilir.
      if (img.mediaType === "VIDEO") return;
      fetch(img.url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Görsel alınamadı."))))
        .then((blob) => {
          if (cancelled) return;
          const blobUrl = URL.createObjectURL(blob);
          urls.push(blobUrl);
          preloaded.current[i] = { blob, blobUrl, fileName: nameFor(i) };
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      preloaded.current = [];
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // nameFor görsel listesinden türediği için imageKey yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey]);

  const hasText = !!post.text;
  const hasContent = count > 0 || hasText;
  const videoCount = images.filter((i) => i.mediaType === "VIDEO").length;
  const onlyImages = videoCount === 0;
  // "3 Görseli", "3 Dosyayı", "Videoyu" ...
  const mediaWord =
    count > 1 ? `${count} ${onlyImages ? "görseli" : "dosyayı"}` : onlyImages ? "görseli" : "videoyu";
  const cap = (t: string) => t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1);
  const buttonLabel =
    count > 0 && hasText
      ? count > 1 || !onlyImages
        ? `${cap(mediaWord)} İndir ve Metni Kopyala`
        : "İndir ve Kopyala"
      : count > 0
        ? count > 1 || !onlyImages
          ? `${cap(mediaWord)} İndir`
          : "İndir"
        : "Metni Kopyala";

  const downloadAll = async () => {
    const ready = preloaded.current.filter(Boolean);
    const allReady = ready.length === count;

    // Telefonda birden çok görsel: paylaşım menüsü tek seferde hepsini "Görüntülere Kaydet"e verir.
    // (Video varsa bu yol kullanılmaz: büyük dosyalar belleğe alınmadan doğrudan indirilir.)
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse && count > 1 && onlyImages && allReady && typeof navigator.canShare === "function") {
      const files = ready.map((r) => new File([r.blob], r.fileName, { type: r.blob.type }));
      if (navigator.canShare({ files })) {
        try {
          await navigator.share({ files });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          // Paylaşım desteklenmediyse tek tek indirmeye düş.
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const cached = preloaded.current[i];
      if (cached) {
        triggerDownload(cached.blobUrl, cached.fileName);
      } else {
        // Video (ya da henüz hazır olmayan görsel): aynı siteden doğrudan indirme; tarayıcı diske akıtır.
        triggerDownload(images[i].url, nameFor(i));
      }
      if (i < count - 1) await sleep(350);
    }
  };

  const handleCopyDownload = async () => {
    setStatus(null);
    setBusy(true);
    // Kopyalama, kullanıcı dokunuşunun içinde hemen başlatılır.
    const copy = hasText ? copyText(post.text as string) : Promise.resolve();
    try {
      await Promise.all([copy, count > 0 ? downloadAll() : Promise.resolve()]);
      setStatus({
        kind: "ok",
        text:
          count > 0 && hasText
            ? `${cap(mediaWord)} indirildi, metin panoya kopyalandı.`
            : count > 0
              ? `${cap(mediaWord)} indirildi.`
              : "Metin panoya kopyalandı.",
      });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "İşlem tamamlanamadı." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-h-[92dvh] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-4 py-3">
        <div className="min-w-0">
          <span
            className="inline-block max-w-full truncate rounded-md px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: post.color, color: textOn(post.color) }}
          >
            {post.clientName}
          </span>
          {post.title && <h2 className="mt-1.5 text-base font-bold leading-snug">{post.title}</h2>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-(--color-text-muted)">
            <span>{formatShareDate(post.date)}</span>
            <span className="font-semibold">{SHARE_KIND_LABEL[post.kind]}</span>
            <span className="tabular-nums">{post.time ? `Saat ${post.time}` : "Saat belirlenmedi"}</span>
            {post.published && (
              <span className="flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <Check size={12} /> Paylaşıldı
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {count > 0 && (
          <div>
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                setSlide(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
              }}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg [scrollbar-width:none]"
            >
              {images.map((img, i) =>
                img.mediaType === "VIDEO" ? (
                  <video
                    key={img.id}
                    src={img.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[50dvh] w-full shrink-0 snap-center rounded-lg bg-black"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.name ?? `${post.clientName} görsel ${i + 1}`}
                    className="max-h-[50dvh] w-full shrink-0 snap-center rounded-lg border border-(--color-border) object-contain"
                  />
                )
              )}
            </div>
            {count > 1 && (
              <div className="mt-2 flex items-center justify-center gap-1.5">
                {images.map((img, i) => (
                  <span
                    key={img.id}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slide ? "w-4 bg-brand-600" : "w-1.5 bg-(--color-border)"
                    }`}
                  />
                ))}
                <span className="ml-2 text-[11px] tabular-nums text-(--color-text-muted)">
                  {slide + 1} / {count}
                </span>
              </div>
            )}
          </div>
        )}
        {post.cover && (
          <a
            href={`${post.cover.url}?download=1`}
            className="flex items-center gap-3 rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.cover.url} alt="Reels kapağı" className="h-16 w-12 shrink-0 rounded object-cover" />
            <span className="min-w-0 text-xs">
              <span className="block font-semibold">Reels kapağı</span>
              <span className="text-(--color-text-muted)">İndirmek için tıklayın</span>
            </span>
          </a>
        )}
        {post.text && (
          <p className="whitespace-pre-wrap break-words rounded-lg bg-(--color-surface-muted) p-3 text-sm">
            {post.text}
          </p>
        )}
        {!hasContent && (
          <p className="rounded-lg border border-dashed border-(--color-border) p-4 text-center text-sm text-(--color-text-muted)">
            Bu paylaşımın görseli ve metni henüz hazırlanmadı.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-(--color-border) p-4">
        {status && (
          <p
            className={`flex items-center gap-1.5 text-xs ${
              status.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-brand-600"
            }`}
          >
            {status.kind === "ok" && <Check size={13} />}
            {status.text}
          </p>
        )}
        {canMark && (
          <div className="space-y-1.5 rounded-lg border border-(--color-border) p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={post.published}
                disabled={pending || metaPending || metaLocked}
                onChange={(e) =>
                  startTransition(async () => {
                    try {
                      await setShareStatus(post.id, { published: e.target.checked });
                    } catch (err) {
                      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Kaydedilemedi." });
                    }
                  })
                }
                className="h-4 w-4"
              />
              Paylaşıldı
            </label>
            {/* Meta'da planlandı: elle işaretlenmez; aşağıdaki düğmeyle planlanınca kendiliğinden işaretlenir. */}
            {scheduled && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked readOnly disabled className="h-4 w-4" />
                  Meta&apos;da planlandı
                </label>
                <p className="text-[11px] text-(--color-text-muted)">
                  {legacyScheduled
                    ? "Meta Business Suite'te elle planlanmış olarak işaretli; saati geldiğinde otomatik \"paylaşıldı\" sayılır."
                    : `${post.time} saatinde Instagram ve Facebook'ta otomatik paylaşılacak. Değişiklik yapmak için önce planlamadan kaldırın.`}
                </p>
              </>
            )}
            {post.metaStatus === "PUBLISHING" && (
              <p className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
                <Loader2 size={15} className="animate-spin" /> Şu an Instagram ve Facebook&apos;ta paylaşılıyor...
              </p>
            )}
            {autoPublished && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--color-text-muted)">
                <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check size={12} /> {post.metaStatus === "PARTIAL" ? "Meta'da kısmen paylaşıldı" : "Meta'da otomatik paylaşıldı"}
                </span>
                {post.igPermalink && (
                  <a href={post.igPermalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium underline">
                    Instagram&apos;da aç <ExternalLink size={11} />
                  </a>
                )}
              </p>
            )}
            {post.metaError && (post.metaStatus === "FAILED" || autoPublished) && (
              <p
                className={`flex items-start gap-1.5 rounded-md p-2 text-[11px] ${
                  post.metaStatus === "FAILED"
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-200"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-900/10 dark:text-amber-300"
                }`}
              >
                <AlertTriangle size={13} className="mt-px shrink-0" />
                <span className="break-words">
                  {post.metaStatus === "FAILED" ? "Otomatik paylaşım yapılamadı: " : ""}
                  {post.metaError}
                </span>
              </p>
            )}
            {canEdit && scheduled && (
              <button
                type="button"
                onClick={unscheduleFromMeta}
                disabled={metaPending || pending}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-(--color-border) px-3 py-2 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
              >
                {metaPending ? <Loader2 size={15} className="animate-spin" /> : <CalendarX2 size={15} />}
                {metaPending ? "Planlamadan kaldırılıyor..." : "Planlamadan kaldır"}
              </button>
            )}
            {canEdit && !scheduled && !post.published && post.metaStatus !== "PUBLISHING" && (
              <>
                <button
                  type="button"
                  onClick={scheduleOnMeta}
                  disabled={metaPending || pending || metaProblems.length > 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {metaPending ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
                  {metaPending ? "Meta'da planlanıyor..." : post.metaStatus === "FAILED" ? "Meta'da yeniden planla" : "Meta'da planla"}
                </button>
                {metaPending && (
                  <p className="text-[11px] text-(--color-text-muted)">
                    Dosyalar Instagram&apos;a doğrulatılıyor; videolarda bir dakikaya kadar sürebilir. Pencereyi kapatmayın.
                  </p>
                )}
                {!metaPending && accessWarning && (
                  <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-900/10 dark:text-amber-300">
                    <AlertTriangle size={13} className="mt-px shrink-0" />
                    <span>{accessWarning}</span>
                  </p>
                )}
                {!metaPending && !accessWarning && metaProblems.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-(--color-text-muted)">
                    {metaProblems.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        {hasContent && !viewOnly && (
          <button
            type="button"
            onClick={handleCopyDownload}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            <Download size={18} />
            {buttonLabel}
          </button>
        )}

        {canEdit && (
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onEdit}
              disabled={metaLocked}
              title={metaLocked ? "Meta'da planlı: düzenlemek için önce planlamadan kaldırın" : undefined}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted) disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Pencil size={13} />
              Düzenle
            </button>
            {confirmingDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-(--color-text-muted)">Silinsin mi?</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await deleteSharePost(post.id);
                        onClose();
                      } catch (e) {
                        setStatus({
                          kind: "error",
                          text: e instanceof Error ? e.message : "Silinemedi.",
                        });
                      }
                    })
                  }
                  className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                >
                  Evet, sil
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded px-2 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                >
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
              >
                <Trash2 size={13} />
                Sil
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SharePostView({
  post,
  canEdit,
  viewOnly = false,
  canMark = false,
  onClose,
  onEdit,
}: {
  post: SharePostRow | null;
  canEdit: boolean;
  viewOnly?: boolean;
  canMark?: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (post) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [post]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
    >
      {post && (
        <ViewContent
          key={post.id}
          post={post}
          canEdit={canEdit}
          viewOnly={viewOnly}
          canMark={canMark}
          onClose={onClose}
          onEdit={onEdit}
        />
      )}
    </dialog>
  );
}
