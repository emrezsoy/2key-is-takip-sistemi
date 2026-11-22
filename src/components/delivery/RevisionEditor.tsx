"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Eraser, MessageSquarePlus, Pencil, Send, Undo2, X } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import type { UploadProgress } from "@/lib/useUploader";

export type RevisionImage = { id: string; url: string; mediaType: "IMAGE" | "VIDEO" };

// Çizimler ve notlar görselin boyutuna göre 0..1 aralığında saklanır; ekran boyutundan bağımsızdır.
type Stroke = { color: string; w: number; pts: [number, number][] };
type Note = { id: number; x: number; y: number; text: string };
type Layer = { strokes: Stroke[]; notes: Note[]; order: ("s" | "n")[] };

const COLORS = ["#ef4444", "#2563eb", "#111111", "#ffffff"];
const NOTE_WIDTH = 0.4; // sticker genişliği: görselin %40'ı
const emptyLayer = (): Layer => ({ strokes: [], notes: [], order: [] });
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Görselin üzerine çizimleri ve sticker notları işleyip tek bir PNG üretir (ekip bunu referans olarak görür). */
async function composite(src: string, strokes: Stroke[], notes: Note[]): Promise<Blob> {
  const img = await loadImage(src);
  const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale);
  const H = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel hazırlanamadı.");
  ctx.drawImage(img, 0, 0, W, H);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(2, s.w * W);
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
    ctx.stroke();
  }

  const fs = Math.max(14, Math.round(W * 0.024));
  ctx.font = `600 ${fs}px sans-serif`;
  ctx.textBaseline = "top";
  const bw = W * NOTE_WIDTH;
  const pad = fs * 0.6;
  const lineH = fs * 1.3;
  notes.forEach((n, i) => {
    const lines = wrapText(ctx, `${i + 1}) ${n.text}`, bw - pad * 2);
    const bh = pad * 2 + lines.length * lineH;
    const x = Math.max(2, Math.min(n.x * W, W - bw - 2));
    const y = Math.max(2, Math.min(n.y * H, H - bh - 2));
    const r = fs * 0.4;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = fs * 0.5;
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + bw, y, x + bw, y + bh, r);
    ctx.arcTo(x + bw, y + bh, x, y + bh, r);
    ctx.arcTo(x, y + bh, x, y, r);
    ctx.arcTo(x, y, x + bw, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#111111";
    lines.forEach((l, j) => ctx.fillText(l, x + pad, y + pad + j * lineH));
  });

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Görsel hazırlanamadı."))), "image/png")
  );
}

/** Müşterinin tamamlanan iş görseli üzerine kalemle çizip sticker not yazarak revize istediği ekran.
 * Gönderilen istek önce yöneticiye onaya gider. `submit` formu sunucuya yollar (görsel numaraları `images` sırasıdır). */
export function RevisionEditor({
  title,
  subtitle,
  images,
  submit,
  progress = null,
  team = false,
  onClose,
}: {
  title: string;
  subtitle?: string;
  images: RevisionImage[];
  submit: (formData: FormData) => Promise<void>;
  /** Gönderim sırasındaki yükleme ilerlemesi (çizimli görseller yüklenirken çubuk gösterilir). */
  progress?: UploadProgress | null;
  /** Ekip revizesi (içerik listesinden): onay adımı yok, revize doğrudan işin kartına gider. */
  team?: boolean;
  onClose: () => void;
}) {
  const imageItems = images.map((img, index) => ({ img, index })).filter((x) => x.img.mediaType === "IMAGE");
  const [activeId, setActiveId] = useState(imageItems[0]?.img.id ?? "");
  const [layers, setLayers] = useState<Record<string, Layer>>({});
  const [tool, setTool] = useState<"pen" | "note">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [general, setGeneral] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [focusId, setFocusId] = useState<number | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const noteSeq = useRef(0);

  const active = imageItems.find((x) => x.img.id === activeId);
  const layer = layers[activeId] ?? emptyLayer();

  const update = (fn: (l: Layer) => Layer) => setLayers((prev) => ({ ...prev, [activeId]: fn(prev[activeId] ?? emptyLayer()) }));

  // Görselin ekrandaki boyutunu izle (çizgi kalınlığı ve SVG ölçeği için).
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeId]);

  const point = (e: React.PointerEvent): [number, number] => {
    const r = overlayRef.current!.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  };

  const onDown = (e: React.PointerEvent) => {
    if (!active || tool !== "pen") return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const w = 4 / Math.max(size.w, 1);
    update((l) => ({ ...l, strokes: [...l.strokes, { color, w, pts: [p, p] }], order: [...l.order, "s"] }));
  };

  // Not, fare tıklaması tamamlandıktan sonra eklenir; aksi halde tıklamanın odak değişimi kutuyu hemen kapatırdı.
  const onNoteClick = (e: React.MouseEvent) => {
    if (!active || tool !== "note") return;
    const r = overlayRef.current!.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width);
    const py = clamp((e.clientY - r.top) / r.height);
    const id = ++noteSeq.current;
    update((l) => ({
      ...l,
      notes: [...l.notes, { id, x: Math.min(px, 1 - NOTE_WIDTH), y: Math.min(py, 0.82), text: "" }],
      order: [...l.order, "n"],
    }));
    setFocusId(id);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = point(e);
    update((l) => {
      const strokes = l.strokes.slice();
      const last = strokes[strokes.length - 1];
      if (last) strokes[strokes.length - 1] = { ...last, pts: [...last.pts, p] };
      return { ...l, strokes };
    });
  };

  const onUp = () => {
    drawing.current = false;
  };

  const undo = () =>
    update((l) => {
      const last = l.order[l.order.length - 1];
      if (!last) return l;
      return last === "s"
        ? { ...l, strokes: l.strokes.slice(0, -1), order: l.order.slice(0, -1) }
        : { ...l, notes: l.notes.slice(0, -1), order: l.order.slice(0, -1) };
    });

  const removeNote = (id: number) =>
    update((l) => {
      const idx = l.notes.findIndex((n) => n.id === id);
      if (idx < 0) return l;
      // order dizisinden o notun girişini çıkar (n'lerin sırası notes sırasıyla aynı).
      let seen = -1;
      const order = l.order.filter((o) => (o === "n" ? ++seen !== idx : true));
      return { ...l, notes: l.notes.filter((n) => n.id !== id), order };
    });

  const hasAnything =
    general.trim().length > 0 ||
    Object.values(layers).some((l) => l.strokes.length > 0 || l.notes.some((n) => n.text.trim()));

  const send = () => {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("note", general.trim());
        const annotations: { index: number; texts: string[] }[] = [];
        for (const { img, index } of imageItems) {
          const l = layers[img.id];
          if (!l) continue;
          const notes = l.notes.filter((n) => n.text.trim());
          if (l.strokes.length === 0 && notes.length === 0) continue;
          const blob = await composite(img.url, l.strokes, notes.map((n) => ({ ...n, text: n.text.trim() })));
          fd.append("files", new File([blob], `g${index}.png`, { type: "image/png" }));
          if (notes.length > 0) annotations.push({ index, texts: notes.map((n) => n.text.trim()) });
        }
        fd.set("annotations", JSON.stringify(annotations));
        await submit(fd);
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revize gönderilemedi.");
      }
    });
  };

  if (done) {
    return (
      <div className="space-y-4 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Check size={24} />
        </div>
        <h2 className="text-lg font-bold">{team ? "Revize verildi" : "Revize isteğiniz iletildi"}</h2>
        <p className="text-sm text-(--color-text-muted)">
          {team ? (
            <>İş, bu revize notuyla iş listesine &quot;Devam ediyor&quot; olarak geri döndü; çalışana bildirim gitti.</>
          ) : (
            <>
              İsteğiniz önce yöneticimizin onayına gönderildi. Onaylandığında iş listemize alınacak; durumunu
              &quot;Talepler&quot; sayfasından takip edebilirsiniz.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Tamam
        </button>
      </div>
    );
  }

  const fontPx = Math.max(11, size.w * 0.024);

  return (
    <div className="flex max-h-[94dvh] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-snug">{team ? "Revize ver" : "Revize iste"}</h2>
          <p className="truncate text-xs text-(--color-text-muted)">
            {title}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Vazgeç" className="shrink-0">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {imageItems.length > 0 ? (
          <>
            <p className="text-xs text-(--color-text-muted)">
              Kalemle değişmesini istediğiniz yeri çizin, &quot;Not&quot; ile görselin üstüne yazı yapıştırın (ör. &quot;burayı şöyle yapalım&quot;).
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTool("pen")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tool === "pen" ? "bg-brand-600 text-white" : "border border-(--color-border) hover:bg-(--color-surface-muted)"
                }`}
              >
                <Pencil size={13} /> Kalem
              </button>
              <button
                type="button"
                onClick={() => setTool("note")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tool === "note" ? "bg-brand-600 text-white" : "border border-(--color-border) hover:bg-(--color-surface-muted)"
                }`}
              >
                <MessageSquarePlus size={13} /> Not ekle
              </button>
              <span className="mx-1 h-5 w-px bg-(--color-border)" />
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setTool("pen");
                  }}
                  aria-label={`Renk ${c}`}
                  className={`h-6 w-6 rounded-full border-2 ${color === c && tool === "pen" ? "border-brand-600 ring-2 ring-brand-300" : "border-(--color-border)"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <span className="mx-1 h-5 w-px bg-(--color-border)" />
              <button
                type="button"
                onClick={undo}
                disabled={layer.order.length === 0}
                className="flex items-center gap-1 rounded-lg border border-(--color-border) px-2.5 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-40"
              >
                <Undo2 size={13} /> Geri al
              </button>
              <button
                type="button"
                onClick={() => update(() => emptyLayer())}
                disabled={layer.order.length === 0}
                className="flex items-center gap-1 rounded-lg border border-(--color-border) px-2.5 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-40"
              >
                <Eraser size={13} /> Temizle
              </button>
            </div>

            {active && (
              <div className="rounded-lg bg-(--color-surface-muted) p-2">
                <div className="relative mx-auto w-fit max-w-full select-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={active.img.id}
                    ref={imgRef}
                    src={active.img.url}
                    alt={`Görsel ${active.index + 1}`}
                    draggable={false}
                    onLoad={(e) => setSize({ w: e.currentTarget.clientWidth, h: e.currentTarget.clientHeight })}
                    className="block max-h-[52dvh] max-w-full rounded"
                  />
                  <div
                    ref={overlayRef}
                    onPointerDown={onDown}
                    onClick={onNoteClick}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    className="absolute inset-0 cursor-crosshair"
                    style={{ touchAction: "none" }}
                  >
                    <svg width={size.w} height={size.h} className="pointer-events-none absolute inset-0">
                      {layer.strokes.map((s, i) => (
                        <polyline
                          key={i}
                          points={s.pts.map(([x, y]) => `${x * size.w},${y * size.h}`).join(" ")}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={Math.max(2, s.w * size.w)}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                    {layer.notes.map((n, i) => (
                      <div
                        key={n.id}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute rounded-md bg-yellow-300 p-1.5 text-black shadow-lg"
                        style={{
                          left: `${n.x * 100}%`,
                          top: `${n.y * 100}%`,
                          width: `${NOTE_WIDTH * 100}%`,
                          fontSize: `${fontPx}px`,
                          cursor: "default",
                        }}
                      >
                        <div className="flex items-start gap-1">
                          <span className="mt-0.5 shrink-0 font-bold">{i + 1})</span>
                          <textarea
                            ref={(el) => {
                              if (el && focusId === n.id) {
                                el.focus();
                                setFocusId(null);
                              }
                            }}
                            value={n.text}
                            maxLength={300}
                            rows={2}
                            placeholder="Notunuzu yazın..."
                            onChange={(e) =>
                              update((l) => ({ ...l, notes: l.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) }))
                            }
                            onBlur={() => {
                              if (!n.text.trim()) removeNote(n.id);
                            }}
                            className="min-w-0 flex-1 resize-none bg-transparent font-semibold leading-tight outline-none placeholder:font-normal placeholder:text-black/50"
                          />
                          <button
                            type="button"
                            onClick={() => removeNote(n.id)}
                            aria-label="Notu sil"
                            className="shrink-0 rounded p-0.5 hover:bg-black/10"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {imageItems.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imageItems.map(({ img, index }) => {
                  const l = layers[img.id];
                  const marked = !!l && (l.strokes.length > 0 || l.notes.some((n) => n.text.trim()));
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setActiveId(img.id)}
                      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                        img.id === activeId ? "border-brand-600" : "border-(--color-border)"
                      }`}
                      aria-label={`Görsel ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] font-bold text-white">{index + 1}</span>
                      {marked && <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-(--color-border) p-3 text-xs text-(--color-text-muted)">
            Bu çalışmada üzerine çizilebilecek bir görsel yok (ör. video). Revize isteğinizi aşağıya yazabilirsiniz.
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Genel not (opsiyonel)</label>
          <textarea
            value={general}
            onChange={(e) => setGeneral(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Örn. Renkleri biraz daha canlı yapalım, metin fontu değişsin..."
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-(--color-border) p-4">
        <UploadBar progress={progress} label="Revize gönderiliyor" />
        {error && <p className="text-xs text-brand-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-(--color-text-muted)">
            {team ? "İş, bu revizeyle iş kartına geri döner." : "İsteğiniz önce yöneticimizin onayına gider."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={send}
              disabled={pending || !hasAnything}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Send size={14} />
              {pending ? "Gönderiliyor..." : "Revizeyi gönder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
