"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarPlus, Check, X } from "lucide-react";
import {
  getItemSendOptions,
  getSendOptions,
  sendFilesToSharePost,
  sendItemToSharePost,
  type SendOptions,
} from "@/lib/actions/sharePosts";

export type SendFile = { url: string; name: string };

/** Gönderilecek dosyaların kaynağı: bir iş (teslim dosyaları) ya da içerik tablosunda onaylanmış satır. */
export type SendSource = { kind: "task"; taskId: string } | { kind: "item"; itemId: string };

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  );

/** İş ekranından seçilen görselleri paylaşım takvimine gönderir: yeni paylaşım ya da müşterinin mevcut paylaşımına ekleme. */
export function SendToCalendarDialog({
  source,
  files,
  onClose,
}: {
  source: SendSource;
  files: SendFile[];
  onClose: () => void;
}) {
  const sourceKey = source.kind === "task" ? `t:${source.taskId}` : `i:${source.itemId}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<SendOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"POST" | "STORY" | "REEL">("POST");
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState("");
  const [postId, setPostId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ date: string; added: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
    let cancelled = false;
    (source.kind === "task" ? getSendOptions(source.taskId) : getItemSendOptions(source.itemId))
      .then((o) => {
        if (cancelled) return;
        setOptions(o);
        setDate(o.prefill?.date || o.today);
        if (o.prefill) {
          if (o.prefill.time) setTime(o.prefill.time);
          if (o.prefill.title) setTitle(o.prefill.title);
          if (o.prefill.text) setText(o.prefill.text);
          if (o.prefill.kind) setKind(o.prefill.kind);
        }
        if (o.posts.length > 0) {
          setPostId(o.posts.find((p) => p.date >= o.today)?.id ?? o.posts[0].id);
        }
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Yüklenemedi."));
    return () => {
      cancelled = true;
    };
    // source yalnızca sourceKey değiştiğinde yeniden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const fields =
          mode === "existing"
            ? { mode, postId }
            : { mode, date, title: title.trim() || undefined, text, time: time || undefined, kind };
        const r =
          source.kind === "item"
            ? await sendItemToSharePost({ itemId: source.itemId, ...fields })
            : await sendFilesToSharePost({
                taskId: source.taskId,
                fileUrls: files.map((f) => f.url),
                ...fields,
                ...(mode === "new" ? { clientId: clientId || undefined } : {}),
              });
        setDone({ date: r.date, added: r.added, skipped: r.skipped });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gönderilemedi.");
      }
    });
  };

  const inputClass =
    "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";
  const needsClient = !!options && !options.clientId && mode === "new";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/60"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <CalendarPlus size={16} />
            Paylaşım takvimine gönder
          </h3>
          <button type="button" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <ul className="flex gap-1.5 overflow-x-auto">
            {files.map((f, i) => (
              <li key={f.url} className="relative h-14 w-14 shrink-0">
                {/\.(mp4|mov|webm|m4v)$/i.test(f.name) ? (
                  <video
                    src={`${f.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full rounded-md border border-(--color-border) object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.name} className="h-full w-full rounded-md border border-(--color-border) object-cover" />
                )}
                <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">
                  {i + 1}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-(--color-text-muted)">
            {files.length} dosya
            {files.length > 1 ? " kaydırmalı paylaşım olarak" : ""} gönderilecek. Dosyalar Drive&apos;da yerinde kalır,
            kopya oluşmaz.
          </p>

          {loadError && <p className="text-xs text-brand-600">{loadError}</p>}

          {done ? (
            <div className="space-y-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <Check size={15} />
                {done.added} dosya eklendi
                {done.skipped > 0 && ` (${done.skipped} tanesi zaten paylaşımdaydı)`}.
              </p>
              <Link
                href={`/paylasim-takvimi?year=${done.date.slice(0, 4)}&month=${Number(done.date.slice(5, 7))}`}
                className="inline-block text-xs font-semibold underline"
              >
                Takvimde gör ({dayLabel(done.date)})
              </Link>
            </div>
          ) : (
            options && (
              <>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-(--color-surface-muted) p-1 text-xs font-semibold">
                  {(
                    [
                      ["new", "Yeni paylaşım"],
                      ["existing", "Mevcut paylaşıma ekle"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      disabled={key === "existing" && options.posts.length === 0}
                      onClick={() => setMode(key)}
                      className={`rounded-md px-2 py-1.5 transition-colors disabled:opacity-40 ${
                        mode === key ? "bg-(--color-surface) shadow-sm" : "text-(--color-text-muted)"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {mode === "new" ? (
                  <div className="space-y-3">
                    {needsClient ? (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Müşteri</label>
                        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
                          <option value="">Seçiniz</option>
                          {options.clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-(--color-text-muted)">
                        Müşteri: <strong className="text-(--color-text)">{options.clientName}</strong>
                      </p>
                    )}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                        Paylaşım tarihi
                      </label>
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Tür</label>
                        <select value={kind} onChange={(e) => setKind(e.target.value as "POST" | "STORY" | "REEL")} className={inputClass}>
                          <option value="POST">Post</option>
                          <option value="REEL">Reels</option>
                          <option value="STORY">Story</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Paylaşım saati</label>
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                    <p className="-mt-2 text-[11px] text-(--color-text-muted)">
                      Saati gelmeden 5 dk önce bildirim gider; saat boşsa o gün 10:00&apos;da hatırlatılır.
                    </p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                        Başlık (boşsa işin başlığı kullanılır)
                      </label>
                      <input
                        value={title}
                        maxLength={120}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                        Paylaşım metni (opsiyonel)
                      </label>
                      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={inputClass} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-(--color-text-muted)">
                      {options.clientName} için takvimdeki paylaşımlar (son 2 hafta ve sonrası):
                    </p>
                    <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                      {options.posts.map((p) => (
                        <li key={p.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm ${
                              postId === p.id
                                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/10"
                                : "border-(--color-border) hover:bg-(--color-surface-muted)"
                            }`}
                          >
                            <input
                              type="radio"
                              name="send-post"
                              checked={postId === p.id}
                              onChange={() => setPostId(p.id)}
                              className="h-4 w-4"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{p.title || "Başlıksız paylaşım"}</span>
                              <span className="block text-[11px] text-(--color-text-muted)">
                                {dayLabel(p.date)} · {p.imageCount} görsel
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {error && <p className="text-xs text-brand-600">{error}</p>}
              </>
            )
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-(--color-border) p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            {done ? "Kapat" : "Vazgeç"}
          </button>
          {!done && (
            <button
              type="button"
              disabled={pending || !options || (mode === "existing" && !postId) || (needsClient && !clientId)}
              onClick={submit}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Gönderiliyor..." : "Gönder"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
