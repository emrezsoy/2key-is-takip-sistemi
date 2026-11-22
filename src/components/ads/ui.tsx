"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

export const inputCls =
  "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-60";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-60";
export const errorBox = "rounded-lg bg-brand-50 p-2.5 text-xs text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";

const pad = (n: number) => String(n).padStart(2, "0");
/** <input type="datetime-local"> değeri (tarayıcının saat dilimi). */
export function toLocalInput(d: Date | null) {
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
export const isoToLocalInput = (iso: string | null) => (iso ? toLocalInput(new Date(iso)) : "");
export const parseMoney = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));
export const money = (n: number | null) => (n == null ? "—" : `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n)} ₺`);

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  const w = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : "max-w-md";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`m-auto w-[calc(100%-1.5rem)] ${w} rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-left text-(--color-text) backdrop:bg-black/50`}
    >
      {open && (
        <div className="max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-surface) px-5 py-3">
            <h3 className="truncate text-sm font-bold">{title}</h3>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)">
              <X size={16} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-(--color-text-muted)">{hint}</span>}
    </label>
  );
}

export function Chip({ children, onRemove, tone = "default" }: { children: React.ReactNode; onRemove?: () => void; tone?: "default" | "exclude" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs ${
        tone === "exclude" ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300" : "bg-(--color-surface-muted)"
      }`}
    >
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-black/10">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/** Yazdıkça sunucuda arayan, sonuçtan seçtiren kutu. */
export function SearchPick<T>({
  placeholder,
  search,
  onPick,
  render,
  itemKey,
}: {
  placeholder: string;
  search: (q: string) => Promise<T[]>;
  onPick: (item: T) => void;
  render: (item: T) => React.ReactNode;
  itemKey: (item: T) => string;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [res, setRes] = useState<{ q: string; items: T[] }>({ q: "", items: [] });
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });
  useEffect(() => {
    if (dq.trim().length < 2) return;
    let alive = true;
    searchRef.current(dq).then((items) => {
      if (alive) setRes({ q: dq, items });
    });
    return () => {
      alive = false;
    };
  }, [dq]);
  const active = q.trim().length >= 2;
  const items = active && res.q === dq ? res.items : [];
  const loading = active && res.q !== q;
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-2.5 text-(--color-text-muted)" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-8`} />
      {loading && <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin text-(--color-text-muted)" />}
      {items.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-surface) shadow-lg">
          {items.map((it) => (
            <li key={itemKey(it)}>
              <button
                type="button"
                onClick={() => {
                  onPick(it);
                  setQ("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-(--color-surface-muted)"
              >
                {render(it)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sekmeli bölüm başlığı. */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-(--color-surface-muted) p-1 text-xs font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-3 py-1.5 ${value === o.value ? "bg-(--color-surface) shadow-sm" : "text-(--color-text-muted)"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ n, title, children, right }: { n?: number | string; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          {n !== undefined && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] text-white">{n}</span>}
          {title}
        </h4>
        {right}
      </div>
      {children}
    </section>
  );
}
