"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks, MessageSquareReply, X } from "lucide-react";
import {
  getContentTargets,
  sendTaskToContent,
  sendTaskToRequest,
  type ContentTargets,
} from "@/lib/actions/deliveries";
import { DELIVERY_STATUS_LABEL, type DeliveryStatus } from "./DeliveryBox";

export type DeliverySendFile = { url: string; name: string };

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const monthLabel = (year: number, month: number) => `${MONTH_NAMES[month - 1]} ${year}`;

const inputClass =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

function Shell({
  icon,
  title,
  files,
  note,
  onClose,
  footer,
  children,
}: {
  icon: ReactNode;
  title: string;
  files: DeliverySendFile[];
  note: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/60"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            {icon}
            {title}
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
                <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">{i + 1}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-(--color-text-muted)">{note}</p>
          {children}
        </div>
        <div className="flex justify-end gap-2 border-t border-(--color-border) p-4">{footer}</div>
      </div>
    </dialog>
  );
}

/** İşin teslim dosyalarını içerik tablosundaki bir satırın "Tamamlanan" sütununa gönderir (müşteri onayına sunar). */
export function SendToContentDialog({
  taskId,
  files,
  onClose,
}: {
  taskId: string;
  files: DeliverySendFile[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<ContentTargets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [itemId, setItemId] = useState("");
  const [ym, setYm] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; year: number; month: number } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getContentTargets(taskId)
      .then((o) => {
        if (cancelled) return;
        setOptions(o);
        setYm(`${o.year}-${o.month}`);
        if (o.linkedId) setItemId(o.linkedId);
        else if (o.items.length === 0) setMode("new");
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Yüklenemedi."));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Yeni satır için seçilebilecek aylar: cari ay ve sonraki 6 ay.
  const monthChoices = options
    ? Array.from({ length: 7 }, (_, i) => {
        const idx = options.year * 12 + (options.month - 1) + i;
        return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
      })
    : [];

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const base = { taskId, fileUrls: files.map((f) => f.url) };
        const r =
          mode === "existing"
            ? await sendTaskToContent({ ...base, itemId })
            : await sendTaskToContent({
                ...base,
                newItem: { year: Number(ym.split("-")[0]), month: Number(ym.split("-")[1]), title: title.trim() || undefined },
              });
        setDone({ title: r.title, year: r.year, month: r.month });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gönderilemedi.");
      }
    });
  };

  const grouped = options
    ? options.items.reduce<Record<string, typeof options.items>>((acc, it) => {
        (acc[`${it.year}-${it.month}`] ??= []).push(it);
        return acc;
      }, {})
    : {};

  return (
    <Shell
      icon={<ListChecks size={16} />}
      title="İçerik listesine gönder"
      files={files}
      note={`${files.length} dosya${files.length > 1 ? " kaydırmalı" : ""} içerik tablosunda satırın "Tamamlanan" sütununa konur ve müşterinin onayına sunulur. Dosyalar Drive'da yerinde kalır.`}
      onClose={onClose}
      footer={
        <>
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
              disabled={pending || !options || (mode === "existing" && !itemId)}
              onClick={submit}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Gönderiliyor..." : "Gönder"}
            </button>
          )}
        </>
      }
    >
      {loadError && <p className="text-xs text-brand-600">{loadError}</p>}
      {done ? (
        <div className="space-y-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <p className="flex items-center gap-1.5 font-semibold">
            <Check size={15} />
            &quot;{done.title}&quot; satırına eklendi.
          </p>
          <p className="text-xs">Müşteri İçerik panelinde ({monthLabel(done.year, done.month)}) görüp onaylayabilir ya da revize isteyebilir.</p>
        </div>
      ) : (
        options && (
          <>
            <p className="text-xs text-(--color-text-muted)">
              Müşteri: <strong className="text-(--color-text)">{options.clientName}</strong>
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-(--color-surface-muted) p-1 text-xs font-semibold">
              {(
                [
                  ["existing", "Mevcut satıra"],
                  ["new", "Yeni satır aç"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={key === "existing" && options.items.length === 0}
                  onClick={() => setMode(key)}
                  className={`rounded-md px-2 py-1.5 transition-colors disabled:opacity-40 ${
                    mode === key ? "bg-(--color-surface) shadow-sm" : "text-(--color-text-muted)"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "existing" ? (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {Object.entries(grouped).map(([key, list]) => {
                  const [y, m] = key.split("-").map(Number);
                  return (
                    <div key={key} className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase text-(--color-text-muted)">{monthLabel(y, m)}</p>
                      {list.map((it) => (
                        <label
                          key={it.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm ${
                            itemId === it.id
                              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/10"
                              : "border-(--color-border) hover:bg-(--color-surface-muted)"
                          }`}
                        >
                          <input type="radio" name="send-item" checked={itemId === it.id} onChange={() => setItemId(it.id)} className="h-4 w-4" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{it.title}</span>
                            <span className="block text-[11px] text-(--color-text-muted)">
                              {it.status ? DELIVERY_STATUS_LABEL[it.status as DeliveryStatus] ?? "" : "Henüz tamamlanan yok"}
                              {it.id === options.linkedId ? " · bu işin satırı" : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
                {options.items.length > 0 && itemId && options.items.find((i) => i.id === itemId)?.status && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Bu satırda daha önceki bir tamamlanan var; yenisiyle değiştirilecek ve müşteri onayına yeniden sunulacak.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Ay</label>
                  <select value={ym} onChange={(e) => setYm(e.target.value)} className={inputClass}>
                    {monthChoices.map((c) => (
                      <option key={`${c.year}-${c.month}`} value={`${c.year}-${c.month}`}>
                        {monthLabel(c.year, c.month)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Başlık (boşsa işin başlığı kullanılır)</label>
                  <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}
            {error && <p className="text-xs text-brand-600">{error}</p>}
          </>
        )
      )}
    </Shell>
  );
}

/** İşin teslim dosyalarını, işin geldiği müşteri talebine gönderir (müşteri Talepler sayfasında onaylar / revize ister). */
export function SendToRequestDialog({
  taskId,
  files,
  onClose,
}: {
  taskId: string;
  files: DeliverySendFile[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await sendTaskToRequest({ taskId, fileUrls: files.map((f) => f.url) });
        setDone(r.title);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gönderilemedi.");
      }
    });
  };

  return (
    <Shell
      icon={<MessageSquareReply size={16} />}
      title="Müşteri talebine gönder"
      files={files}
      note={`${files.length} dosya, işin geldiği müşteri talebine eklenir. Müşteri Talepler sayfasında görüp onay verebilir ya da revize isteyebilir. Talepte önceki bir teslim varsa yenisiyle değiştirilir.`}
      onClose={onClose}
      footer={
        <>
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
              disabled={pending}
              onClick={submit}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Gönderiliyor..." : "Gönder"}
            </button>
          )}
        </>
      }
    >
      {done ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <Check size={15} />
          &quot;{done}&quot; talebine gönderildi; müşteri bilgilendirildi.
        </p>
      ) : (
        error && <p className="text-xs text-brand-600">{error}</p>
      )}
    </Shell>
  );
}
