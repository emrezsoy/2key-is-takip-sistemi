"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

type Item = { url: string; name: string; kind: "image" | "video" };

/** İndirme adresi: Drive dosyaları `?download=1` ile her zaman "indirme" olarak sunulur. */
export function downloadHref(url: string) {
  if (!/\/api\/files\//.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "download=1";
}

// Kendi dosya adreslerimiz (Drive ve eski sunucu dosyaları).
const FILE_HREF = /^(https?:\/\/[^/]+)?\/api\/(files|uploads)\//;
const MAX_CLIMB = 3;

function itemOf(a: HTMLAnchorElement): Item | null {
  const href = a.getAttribute("href") ?? "";
  if (!FILE_HREF.test(href)) return null;
  const video = a.querySelector("video");
  const img = a.querySelector("img");
  if (!video && !img) return null;
  return { url: href, name: a.getAttribute("title") || img?.getAttribute("alt") || "", kind: video ? "video" : "image" };
}

/** Tıklanan görselin yanındaki (aynı gruptaki) görsel/videolar: ileri-geri gezilebilsin. */
function groupOf(a: HTMLAnchorElement): { items: Item[]; index: number } {
  const self = itemOf(a) as Item;
  let el: HTMLElement | null = a.parentElement;
  for (let i = 0; i < MAX_CLIMB && el; i++) {
    const anchors = Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const items: Item[] = [];
    let index = 0;
    for (const x of anchors) {
      const it = itemOf(x);
      if (!it || items.some((y) => y.url === it.url)) continue;
      if (x === a) index = items.length;
      items.push(it);
    }
    if (items.length > 1) return { items, index };
    if (el.matches("li, tr, dialog")) break;
    el = el.parentElement;
  }
  return { items: [self], index: 0 };
}

/** Görsel ve videoları yeni sekme yerine uygulamanın içinde büyük açan görüntüleyici.
 * Uygulama genelinde çalışır: `/api/files` ya da `/api/uploads` adresine giden, içinde görsel/video bulunan her bağlantı
 * (küçük resim) tıklanınca bu pencerede açılır. Mobil uygulamada yeni sekmeden geri dönememe sorununu çözer. */
export function MediaLightbox() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState<{ items: Item[]; index: number } | null>(null);
  const pushedRef = useRef(false);
  const touchX = useRef<number | null>(null);

  const closeUi = useCallback(() => {
    if (pushedRef.current) {
      // Geri tuşuyla da kapanabilsin diye eklenen geçmiş kaydını geri al; popstate pencereyi kapatır.
      try {
        window.history.back();
        return;
      } catch {
        pushedRef.current = false;
      }
    }
    setGroup(null);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const a = t.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement) || !itemOf(a)) return;
      e.preventDefault();
      setGroup(groupOf(a));
    };
    const onPop = () => {
      pushedRef.current = false;
      setGroup(null);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const open = group !== null;
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      try {
        window.history.pushState({ ...(window.history.state ?? {}), mediaLightbox: true }, "", window.location.href);
        pushedRef.current = true;
      } catch {
        pushedRef.current = false;
      }
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const step = useCallback((dir: 1 | -1) => {
    setGroup((g) => (g && g.items.length > 1 ? { ...g, index: (g.index + dir + g.items.length) % g.items.length } : g));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  const cur = group ? group.items[group.index] : null;
  const many = (group?.items.length ?? 0) > 1;

  return (
    <dialog
      ref={dialogRef}
      data-no-backdrop-close
      onCancel={(e) => {
        e.preventDefault();
        closeUi();
      }}
      onClick={(e) => {
        // Siyah boşluğa dokunmak kapatır (görsel/video/düğmelere dokunmak kapatmaz).
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.lbBackdrop) closeUi();
      }}
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
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/90 p-0 text-white backdrop:bg-black"
    >
      {cur && (
        <div data-lb-backdrop="1" className="relative flex h-full w-full items-center justify-center p-3 sm:p-8">
          {cur.kind === "video" ? (
            <video
              key={cur.url}
              src={cur.url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-lg bg-black"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={cur.url} src={cur.url} alt={cur.name} className="max-h-full max-w-full rounded-lg object-contain" />
          )}

          <a
            href={downloadHref(cur.url)}
            download={cur.name || true}
            aria-label="İndir"
            title="İndir"
            className="absolute right-[4.25rem] top-3 z-10 flex h-11 items-center gap-1.5 rounded-full bg-black/60 px-4 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-black/80"
            style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <Download size={18} />
            İndir
          </a>
          <button
            type="button"
            onClick={closeUi}
            aria-label="Kapat"
            className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 hover:bg-black/80"
            style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <X size={22} />
          </button>
          {many && group && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Önceki"
                className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/30 hover:bg-black/80"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Sonraki"
                className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/30 hover:bg-black/80"
              >
                <ChevronRight size={24} />
              </button>
              <span
                className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold"
                style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              >
                {group.index + 1} / {group.items.length}
              </span>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
