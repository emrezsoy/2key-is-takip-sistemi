"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Film, ImagePlus, X } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { formatShareDate } from "./SharePostView";
import type { ShareClient, SharePostRow } from "./types";

export type FormTarget =
  | { mode: "add"; date: string; clientId?: string }
  | { mode: "edit"; post: SharePostRow }
  | null;

const MAX_IMAGE_MB = 25;
const MAX_VIDEO_MB = 500;
const MAX_IMAGES = 20;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

type Item =
  | { key: string; kind: "existing"; id: string; url: string; video: boolean }
  | { key: string; kind: "new"; file: File; url: string; video: boolean };

function FormContent({
  target,
  clients,
  onClose,
}: {
  target: NonNullable<FormTarget>;
  clients: ShareClient[];
  onClose: () => void;
}) {
  const editing = target.mode === "edit" ? target.post : null;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const up = useUploader();
  const [items, setItems] = useState<Item[]>(() =>
    (editing?.images ?? []).map((img) => ({
      key: `e-${img.id}`,
      kind: "existing" as const,
      id: img.id,
      url: img.url,
      video: img.mediaType === "VIDEO",
    }))
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Tür (Reels seçilince kapak alanı açılır) ve Reels kapağı.
  const [kind, setKind] = useState<"POST" | "STORY" | "REEL">(editing?.kind ?? "POST");
  const [cover, setCover] = useState<{ file: File; url: string } | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const coverRef = useRef(cover);
  useEffect(() => {
    coverRef.current = cover;
  }, [cover]);
  useEffect(() => () => {
    if (coverRef.current) URL.revokeObjectURL(coverRef.current.url);
  }, []);
  const existingCover = editing?.cover && !coverRemoved ? editing.cover : null;
  const coverPreview = cover?.url ?? existingCover?.url ?? null;
  const pickCover = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Reels kapağı bir görsel olmalı.");
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`Kapak görseli ${MAX_IMAGE_MB}MB'ı aşıyor.`);
    setError(null);
    setCover((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
  };
  const clearCover = () => {
    setCover((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setCoverRemoved(true);
  };

  // Yeni seçilen dosyaların önizleme adreslerini pencere kapanınca serbest bırak.
  useEffect(
    () => () => {
      itemsRef.current.forEach((i) => {
        if (i.kind === "new") URL.revokeObjectURL(i.url);
      });
    },
    []
  );

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const room = MAX_IMAGES - items.length;
    const accepted: Item[] = [];
    let problem: string | null = null;
    for (const file of Array.from(list)) {
      if (accepted.length >= room) {
        problem = `En fazla ${MAX_IMAGES} görsel ekleyebilirsin.`;
        break;
      }
      const video = file.type.startsWith("video/");
      if (video ? !VIDEO_TYPES.includes(file.type) : !file.type.startsWith("image/")) {
        problem = video ? "Video MP4, MOV veya WEBM olmalı." : "Sadece görsel ve video dosyaları eklenebilir.";
        continue;
      }
      const limitMb = video ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      if (file.size > limitMb * 1024 * 1024) {
        problem = `"${file.name}" ${limitMb}MB'ı aşıyor, eklenmedi.`;
        continue;
      }
      accepted.push({
        key: `n-${crypto.randomUUID()}`,
        kind: "new",
        file,
        url: URL.createObjectURL(file),
        video,
      });
    }
    setError(problem);
    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
  };

  const removeItem = (key: string) =>
    setItems((prev) => {
      const target = prev.find((i) => i.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.key !== key);
    });

  const moveItem = (index: number, delta: -1 | 1) =>
    setItems((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  return (
    <form
      action={(formData) => {
        setError(null);
        // Görseller ve sıraları formda durmaz; seçili listeden eklenir.
        formData.delete("images");
        let newIndex = 0;
        const order = items.map((i) => {
          if (i.kind === "existing") return `e:${i.id}`;
          formData.append("images", i.file);
          return `n:${newIndex++}`;
        });
        formData.set("order", JSON.stringify(order));
        formData.delete("cover");
        if (kind === "REEL" && cover) formData.set("cover", cover.file);
        if (coverRemoved && !cover) formData.set("removeCover", "1");
        startTransition(async () => {
          try {
            if (editing) await up.run("updateSharePost", [editing.id], formData);
            else await up.run("createSharePost", [], formData);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Kaydedilemedi.");
          }
        });
      }}
      className="flex max-h-[92dvh] flex-col"
    >
      <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
        <h2 className="text-base font-bold">{editing ? "Paylaşımı Düzenle" : "Yeni Paylaşım"}</h2>
        <button type="button" onClick={onClose} aria-label="Kapat">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Tarih</label>
            <input
              name="date"
              type="date"
              required
              defaultValue={editing?.date ?? (target.mode === "add" ? target.date : "")}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Müşteri</label>
            <select
              name="clientId"
              required
              defaultValue={editing?.clientId ?? (target.mode === "add" ? target.clientId : undefined) ?? ""}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seçiniz
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {target.mode === "add" && (
          <p className="-mt-1 text-[11px] text-(--color-text-muted)">{formatShareDate(target.date)}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Tür</label>
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "POST" | "STORY" | "REEL")}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              <option value="POST">Post</option>
              <option value="REEL">Reels</option>
              <option value="STORY">Story</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Paylaşım saati</label>
            <input name="time" type="time" defaultValue={editing?.time ?? ""} className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-(--color-text-muted)">
          Saati gelmeden 5 dakika önce bildirim gider. Saat boş bırakılırsa o gün 10:00&apos;da hatırlatılır. Meta&apos;da planlamak için saat
          girilmiş olmalı.
        </p>

        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Başlık</label>
          <input
            name="title"
            defaultValue={editing?.title ?? ""}
            maxLength={120}
            placeholder="Örn. Cumhuriyet Bayramı postu"
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <p className="mt-1 text-[11px] text-(--color-text-muted)">
            Tasarım ve metin hazır değilse sadece başlıkla kaydedip sonra içini doldurabilirsin.
          </p>
        </div>

        <UploadBar progress={up.progress} label="Görseller yükleniyor" />
        <FileDropZone onFiles={addFiles} className="rounded-lg" label="Görsel ve videoları bırakın">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-(--color-text-muted)">
              Görsel ve videolar {items.length > 0 && `(${items.length})`}
            </label>
            {items.length > 1 && (
              <span className="text-[11px] text-(--color-text-muted)">
                Kaydırmalı paylaşım: sıra soldan sağa
              </span>
            )}
          </div>

          {items.length > 0 && (
            <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((item, i) => (
                <li
                  key={item.key}
                  className="relative aspect-square overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface-muted)"
                >
                  {item.video ? (
                    <video
                      src={`${item.url}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={`Görsel ${i + 1}`} className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                    {item.video && <Film size={10} />}
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    aria-label={`${i + 1}. görseli kaldır`}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  >
                    <X size={13} />
                  </button>
                  {items.length > 1 && (
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent px-1 pb-1 pt-4">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveItem(i, -1)}
                        aria-label="Sola taşı"
                        className="rounded-full bg-black/50 p-0.5 text-white disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={i === items.length - 1}
                        onClick={() => moveItem(i, 1)}
                        aria-label="Sağa taşı"
                        className="rounded-full bg-black/50 p-0.5 text-white disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length < MAX_IMAGES && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-(--color-border) px-3 py-2.5 text-sm text-(--color-text-muted) hover:bg-(--color-surface-muted)">
              <ImagePlus size={16} />
              {items.length > 0 ? "Görsel / video ekle" : "Görsel veya video seç (birden çok seçebilirsin)"}
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        </FileDropZone>

        {kind === "REEL" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Reels kapak görseli</label>
            <div className="flex items-center gap-3">
              {coverPreview && (
                <div className="relative h-24 w-[54px] shrink-0 overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreview} alt="Reels kapağı" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={clearCover}
                    aria-label="Kapağı kaldır"
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-(--color-border) px-3 py-2.5 text-sm text-(--color-text-muted) hover:bg-(--color-surface-muted)">
                <ImagePlus size={16} />
                {coverPreview ? "Kapağı değiştir" : "Kapak görseli seç (dikey, 9:16)"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    pickCover(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-(--color-text-muted)">
              Reels için yukarıya tek bir video ekleyin. Kapak eklenmezse Instagram videonun ilk karesini kullanır.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
            Paylaşım metni
          </label>
          <textarea
            name="text"
            rows={6}
            defaultValue={editing?.text ?? ""}
            placeholder="Açıklama, hashtag'ler..."
            className="w-full resize-y rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>

        {error && <p className="text-xs text-brand-600">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t border-(--color-border) p-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

export function SharePostForm({
  target,
  clients,
  onClose,
}: {
  target: FormTarget;
  clients: ShareClient[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (target) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [target]);

  const key = target ? (target.mode === "edit" ? target.post.id : `new-${target.date}`) : "none";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
    >
      {target && <FormContent key={key} target={target} clients={clients} onClose={onClose} />}
    </dialog>
  );
}
