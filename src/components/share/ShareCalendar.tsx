"use client";

import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Clapperboard, Film, ImageIcon, ListChecks, Loader2, Plus, Smartphone, X } from "lucide-react";
import { scheduleSharePostOnMeta } from "@/lib/actions/metaSchedule";
import { metaScheduleProblems } from "@/lib/metaScheduleRules";
import { compareShareTime, SHARE_KIND_LABEL } from "@/lib/shareTime";
import { MONTHS } from "@/lib/format";
import { textOn } from "./palette";
import { ShareColorSettings } from "./ShareColorSettings";
import { SharePostView, formatShareDate } from "./SharePostView";
import { SharePostForm, type FormTarget } from "./SharePostForm";
import { moveSharePost } from "@/lib/actions/sharePosts";
import type { ShareClient, SharePostRow } from "./types";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function DayListDialog({
  date,
  posts,
  canEdit,
  onClose,
  onOpenPost,
  onAdd,
}: {
  date: string | null;
  posts: SharePostRow[];
  canEdit: boolean;
  onClose: () => void;
  onOpenPost: (id: string) => void;
  onAdd: (date: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (date) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [date]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
    >
      {date && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
            <h2 className="text-base font-bold">{formatShareDate(date)}</h2>
            <button type="button" onClick={onClose} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {posts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenPost(p.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-(--color-border) p-2.5 text-left hover:bg-(--color-surface-muted)"
                >
                  {p.images.length > 0 && p.images[0].mediaType !== "VIDEO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.images[0].url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-(--color-surface-muted) text-(--color-text-muted)">
                      {p.images.length > 0 ? <Film size={18} /> : <ImageIcon size={18} />}
                    </span>
                  )}
                  <span className={`min-w-0 flex-1 ${p.published ? "opacity-50" : ""}`}>
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-(--color-text-muted)">
                      {p.kind === "STORY" ? <Smartphone size={11} /> : p.kind === "REEL" ? <Clapperboard size={11} /> : <ImageIcon size={11} />}
                      {SHARE_KIND_LABEL[p.kind]}
                      <span className="tabular-nums">{p.time ?? "saat yok"}</span>
                      {p.published && (
                        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                          <Check size={11} /> Paylaşıldı
                        </span>
                      )}
                      {!p.published && p.metaScheduled && (
                        <span className="flex items-center gap-0.5 text-sky-600 dark:text-sky-400">
                          <CalendarClock size={11} /> Meta
                        </span>
                      )}
                      {!p.published && p.metaStatus === "FAILED" && (
                        <span className="flex items-center gap-0.5 text-brand-600">
                          <AlertTriangle size={11} /> Paylaşılamadı
                        </span>
                      )}
                    </span>
                    <span
                      className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: p.color, color: textOn(p.color) }}
                    >
                      {p.title || p.clientName}
                    </span>
                    {p.title && (
                      <span className="mt-0.5 block truncate text-[11px] text-(--color-text-muted)">
                        {p.clientName}
                      </span>
                    )}
                    {p.text && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-(--color-text-muted)">
                        {p.text}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {posts.length === 0 && (
              <li className="py-6 text-center text-sm text-(--color-text-muted)">
                Bu güne planlanmış paylaşım yok.
              </li>
            )}
          </ul>
          {canEdit && (
            <div className="border-t border-(--color-border) p-4">
              <button
                type="button"
                onClick={() => onAdd(date)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus size={15} />
                Bu güne paylaşım ekle
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Seçim modu: paylaşım Meta'da toplu planlamaya uygun mu? Uygun değilse nedeni (boş = uygun). */
function bulkProblem(p: SharePostRow): string | null {
  if (p.published) return "Zaten paylaşıldı olarak işaretli.";
  if (p.metaStatus === "SCHEDULED" || p.metaStatus === "PUBLISHING") return "Zaten Meta'da planlı.";
  if (p.metaStatus === "PUBLISHED" || p.metaStatus === "PARTIAL") return "Meta'da zaten yayınlandı.";
  if (p.metaScheduled && !p.metaStatus) return "Meta Business'ta elle planlandı olarak işaretli.";
  const problems = metaScheduleProblems({ kind: p.kind, date: p.date, time: p.time, text: p.text, images: p.images, metaAccess: p.metaAccess });
  return problems.length > 0 ? problems.join(" ") : null;
}

/** Takvimdeki paylaşım kutucuğu; düzenleyebilen kişi tutup başka güne sürükleyebilir. Seçim modunda tıklamak seçer. */
function PostChip({
  p,
  index,
  draggable,
  overlay = false,
  onOpen,
  select,
}: {
  p: SharePostRow;
  index: number;
  draggable: boolean;
  overlay?: boolean;
  onOpen?: () => void;
  /** Seçim modu: tüm kutucuklar görünür, tıklamak seçer / bırakır. */
  select?: { selected: boolean; problem: string | null };
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, disabled: !draggable || overlay || !!select });
  const live = draggable && !overlay && !select;
  const visibility = overlay || select ? "flex" : index === 2 ? "hidden sm:flex" : index > 2 ? "hidden" : "flex";
  const base = `${p.published ? "✓ Paylaşıldı · " : ""}${p.time ?? ""} ${p.clientName}${p.title ? ` — ${p.title}` : ""}`.trim();
  return (
    <button
      ref={overlay ? undefined : setNodeRef}
      {...(live ? listeners : {})}
      {...(live ? attributes : {})}
      type="button"
      aria-pressed={select ? select.selected : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      title={select ? (select.problem ? `${base} — Seçilemez: ${select.problem}` : `${base} (seçmek için tıkla)`) : `${base}${live ? " (başka güne sürükleyebilirsin)" : ""}`}
      style={{ backgroundColor: p.color, color: textOn(p.color) }}
      className={`${visibility} w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-semibold leading-tight sm:text-xs ${
        p.published ? "opacity-40" : ""
      } ${isDragging ? "opacity-30" : ""} ${live ? "cursor-grab active:cursor-grabbing" : ""} ${
        select ? (select.selected ? "ring-2 ring-offset-1 ring-sky-500 ring-offset-(--color-surface)" : select.problem ? "opacity-35" : "") : ""
      }`}
    >
      {select && !select.problem && (
        <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${select.selected ? "border-white bg-sky-600" : "border-current"}`}>
          {select.selected && <Check size={9} strokeWidth={4} className="text-white" />}
        </span>
      )}
      {p.published && <Check size={11} className="shrink-0" strokeWidth={3} />}
      {!p.published && p.metaScheduled && <CalendarClock size={10} className="shrink-0" />}
      {!p.published && p.metaStatus === "FAILED" && <AlertTriangle size={10} className="shrink-0" />}
      {p.kind === "STORY" && <Smartphone size={10} className="shrink-0" />}
      {p.kind === "REEL" && <Clapperboard size={10} className="shrink-0" />}
      {p.time && <span className="shrink-0 tabular-nums">{p.time}</span>}
      {p.images.length > 0 && p.kind === "POST" && (
        <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
          {p.images.some((m) => m.mediaType === "VIDEO") ? <Film size={10} /> : <ImageIcon size={10} />}
          {p.images.length > 1 && <span>{p.images.length}</span>}
        </span>
      )}
      <span className="line-clamp-2 min-w-0 break-words sm:truncate">{p.title || p.clientName}</span>
    </button>
  );
}

/** Takvimin bir gün kutusu: paylaşım kutucukları buraya bırakılabilir. */
function DayCell({
  date,
  className,
  droppable,
  children,
  ...rest
}: {
  date: string;
  className: string;
  droppable: boolean;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-brand-100/60 ring-2 ring-inset ring-brand-500 dark:bg-brand-900/30" : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ShareCalendar({
  year,
  month,
  today,
  days,
  posts,
  clients,
  canEdit,
  basePath = "/paylasim-takvimi",
  viewOnly = false,
  initialClient = "",
}: {
  year: number;
  month: number;
  today: string;
  days: { date: string; inMonth: boolean }[];
  posts: SharePostRow[];
  clients: ShareClient[];
  canEdit: boolean;
  /** Ay gezinti bağlantılarının sayfa adresi (müşteri panelinde /panel/takvim). */
  basePath?: string;
  /** Müşteri görünümü: sadece takip; indir/kopyala düğmesi gösterilmez. */
  viewOnly?: boolean;
  /** Sayfa açılırken seçili müşteri (adres çubuğundaki ?musteri=); boşsa tümü. */
  initialClient?: string;
}) {
  const [clientFilter, setClientFilter] = useState(initialClient);
  const [viewId, setViewId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget>(null);
  const [dayList, setDayList] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Seçim modu (müşteri seçiliyken): paylaşımlar tıklanarak seçilir, sonra Meta'da toplu planlanır.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectHint, setSelectHint] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{
    running: boolean;
    done: number;
    total: number;
    current: string | null;
    results: { id: string; title: string; ok: boolean; message: string }[];
  } | null>(null);

  // Sürükleyip bırakınca gün hemen değişmiş görünür; sunucu kaydedince asıl veri gelir.
  const [shownPosts, applyMove] = useOptimistic(posts, (cur, m: { id: string; date: string }) =>
    cur.map((p) => (p.id === m.id ? { ...p, date: m.date } : p))
  );
  const dragEnabled = canEdit && !viewOnly;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  );
  const handleDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const id = String(e.active.id);
    const over = e.over ? String(e.over.id) : "";
    if (!over.startsWith("day:")) return;
    const date = over.slice(4);
    const post = posts.find((p) => p.id === id);
    if (!post || post.date === date) return;
    if (post.metaStatus === "SCHEDULED" || post.metaStatus === "PUBLISHING") {
      setMoveError("Bu paylaşım Meta'da planlı. Gününü değiştirmek için önce paylaşımı açıp \"Planlamadan kaldır\"a basın.");
      return;
    }
    if (post.metaScheduled && !post.published) {
      const ok = window.confirm(
        "Bu paylaşım Meta Business'ta planlandı olarak işaretli. Burada günü değiştirirsen Meta'daki planı da ayrıca değiştirmen gerekir. Yine de taşınsın mı?"
      );
      if (!ok) return;
    }
    setMoveError(null);
    startTransition(async () => {
      applyMove({ id, date });
      try {
        await moveSharePost(id, date);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : "Paylaşım taşınamadı.");
      }
    });
  };
  const handleDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const dragPost = shownPosts.find((p) => p.id === dragId) ?? null;

  // Müşteri filtresi: seçenekler = tanımlı müşteriler + takvimde paylaşımı olanlar; sayılar görünen ayın paylaşımları.
  const clientKey = (p: SharePostRow) => p.clientId ?? p.clientName;
  const filterOptions = new Map<string, { name: string; count: number }>();
  for (const c of clients) filterOptions.set(c.id, { name: c.name, count: 0 });
  for (const p of shownPosts) {
    const k = clientKey(p);
    const cur = filterOptions.get(k) ?? { name: p.clientName, count: 0 };
    if (days.some((d) => d.date === p.date && d.inMonth)) cur.count += 1;
    filterOptions.set(k, cur);
  }
  const filterList = [...filterOptions.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const activeFilter = filterOptions.has(clientFilter) ? clientFilter : "";
  const visiblePosts = activeFilter ? shownPosts.filter((p) => clientKey(p) === activeFilter) : shownPosts;

  const changeClientFilter = (value: string) => {
    if (bulk?.running) return;
    setClientFilter(value);
    // Müşteri değişince seçim sıfırlanır (seçim tek müşteri içindir).
    setSelecting(false);
    setSelected([]);
    setBulk(null);
    setSelectHint(null);
    // Adres çubuğunu güncelle (yenilemede/paylaşırken seçim korunur); sunucuya gitmeden.
    try {
      const url = new URL(window.location.href);
      if (value) url.searchParams.set("musteri", value);
      else url.searchParams.delete("musteri");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* adres güncellenemese de filtre çalışır */
    }
  };
  const monthHref = (y?: number, m?: number) => {
    const q = new URLSearchParams();
    if (y && m) {
      q.set("year", String(y));
      q.set("month", String(m));
    }
    if (activeFilter) q.set("musteri", activeFilter);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const postsByDate = new Map<string, SharePostRow[]>();
  for (const p of visiblePosts) {
    const list = postsByDate.get(p.date) ?? [];
    list.push(p);
    postsByDate.set(p.date, list);
  }
  // Gün içinde saat sırasıyla (saatsizler sonda).
  for (const list of postsByDate.values()) list.sort((a, b) => compareShareTime(a.time, b.time));

  // Renk açıklaması: bu ay takvimde paylaşımı olan müşteriler.
  const legendMap = new Map<string, { name: string; color: string }>();
  for (const p of visiblePosts) {
    if (!days.some((d) => d.date === p.date && d.inMonth)) continue;
    if (!legendMap.has(p.clientName)) legendMap.set(p.clientName, { name: p.clientName, color: p.color });
  }
  const legend = [...legendMap.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const viewPost = shownPosts.find((p) => p.id === viewId) ?? null;

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const isCurrent = today.startsWith(`${year}-${String(month).padStart(2, "0")}`);

  // ---- Seçim modu ve Meta'da toplu planlama ----
  const selectMode = selecting && dragEnabled && !!activeFilter;
  const running = !!bulk?.running;
  const postLabel = (p: SharePostRow) => `${formatShareDate(p.date)}${p.time ? ` ${p.time}` : ""} · ${p.title || p.clientName}`;
  const inMonthDates = new Set(days.filter((d) => d.inMonth).map((d) => d.date));
  const selectableInMonth = visiblePosts.filter((p) => inMonthDates.has(p.date) && !bulkProblem(p));
  const toggleSelect = (p: SharePostRow) => {
    if (running) return;
    const problem = bulkProblem(p);
    if (problem) {
      setSelectHint(`${p.title || p.clientName}: ${problem}`);
      return;
    }
    setSelectHint(null);
    setSelected((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]));
  };
  const startSelecting = () => {
    setSelecting(true);
    setSelected([]);
    setBulk(null);
    setSelectHint(null);
    setMoveError(null);
  };
  const stopSelecting = () => {
    if (running) return;
    setSelecting(false);
    setSelected([]);
    setSelectHint(null);
  };
  const runBulk = async () => {
    if (running) return;
    const queue = shownPosts
      .filter((p) => selected.includes(p.id))
      .sort((a, b) => a.date.localeCompare(b.date) || compareShareTime(a.time, b.time));
    if (queue.length === 0) return;
    if (!window.confirm(`${queue.length} paylaşım, takvimdeki gün ve saatlerinde Meta'da (Instagram / Facebook) planlansın mı?`)) return;
    setSelectHint(null);
    const results: { id: string; title: string; ok: boolean; message: string }[] = [];
    setBulk({ running: true, done: 0, total: queue.length, current: postLabel(queue[0]), results: [] });
    // Tek tek planlanır: her biri Instagram'a önceden yüklenip doğrulandığı için birkaç saniye sürebilir; biri hata verse diğerleri devam eder.
    for (const [i, p] of queue.entries()) {
      setBulk((b) => (b ? { ...b, done: i, current: postLabel(p) } : b));
      let message: string;
      let ok: boolean;
      try {
        const r = await scheduleSharePostOnMeta(p.id);
        ok = r.ok;
        message = r.ok ? "Meta'da planlandı." : r.error;
      } catch (e) {
        ok = false;
        message = e instanceof Error ? e.message : "Planlanamadı.";
      }
      results.push({ id: p.id, title: postLabel(p), ok, message });
      setBulk((b) => (b ? { ...b, done: i + 1, results: [...results] } : b));
    }
    setBulk((b) => (b ? { ...b, running: false, current: null } : b));
    // Planlananlar seçimden çıkar; hata verenler seçili kalır (düzeltip tekrar denemek için).
    setSelected((cur) => cur.filter((id) => !results.some((x) => x.id === id && x.ok)));
  };

  const openAdd = (date: string) => {
    setDayList(null);
    // Müşteri filtresi seçiliyse yeni paylaşım o müşteri için açılır.
    setForm({ mode: "add", date, clientId: activeFilter && clients.some((c) => c.id === activeFilter) ? activeFilter : undefined });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Paylaşım Takvimi</h1>
          <p className="text-sm text-(--color-text-muted)">
            {viewOnly
              ? "Hesaplarınızda paylaşılacak içeriklerin takvimi. Bir paylaşıma tıklayarak görsel ve metnini görebilirsiniz."
              : canEdit
                ? "Bir güne tıklayıp müşteri için paylaşım ekle; paylaşıma tıklayarak görseli indir, metni kopyala. Paylaşımı tutup başka güne sürükleyerek gününü değiştirebilirsin."
                : "Paylaşıma tıklayıp görseli indirebilir ve metni kopyalayabilirsin."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {filterList.length > 1 && (
            <label className="flex items-center gap-2 text-xs font-medium text-(--color-text-muted)">
              Müşteri:
              <select
                value={activeFilter}
                onChange={(e) => changeClientFilter(e.target.value)}
                className={`max-w-48 rounded-lg border bg-(--color-bg) px-2.5 py-1.5 text-sm font-medium text-(--color-text) outline-none focus:border-brand-500 ${
                  activeFilter ? "border-brand-500" : "border-(--color-border)"
                }`}
              >
                <option value="">Tümü</option>
                {filterList.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                    {o.count > 0 ? ` (${o.count})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canEdit && <ShareColorSettings clients={clients} />}
          {!isCurrent && (
            <Link
              href={monthHref()}
              className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted)"
            >
              Bugün
            </Link>
          )}
          <Link
            href={monthHref(prev.y, prev.m)}
            aria-label="Önceki ay"
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="w-32 text-center text-sm font-semibold sm:w-36">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={monthHref(next.y, next.m)}
            aria-label="Sonraki ay"
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {dragEnabled && activeFilter && (
        <div className="sticky top-0 z-10 space-y-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {!selectMode ? (
              <>
                <button
                  type="button"
                  onClick={startSelecting}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-500 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-900/20"
                >
                  <ListChecks size={14} />
                  Seç
                </button>
                <span className="text-xs text-(--color-text-muted)">
                  Paylaşımları seçip Meta&apos;da toplu planlamak için (elle paylaşacaklarını seçme).
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold">{selected.length} seçili</span>
                <button
                  type="button"
                  disabled={running || selectableInMonth.length === 0}
                  onClick={() => {
                    setSelectHint(null);
                    setSelected(selectableInMonth.map((p) => p.id));
                  }}
                  className="rounded-lg border border-(--color-border) px-2.5 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-50"
                >
                  Planlanabilirlerin tümü ({selectableInMonth.length})
                </button>
                {selected.length > 0 && (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => setSelected([])}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-(--color-text-muted) hover:text-brand-600 disabled:opacity-50"
                  >
                    Seçimi temizle
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={running || selected.length === 0}
                    onClick={() => void runBulk()}
                    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {running ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                    Meta&apos;da toplu planla{selected.length > 0 ? ` (${selected.length})` : ""}
                  </button>
                  <button
                    type="button"
                    disabled={running}
                    onClick={stopSelecting}
                    className="rounded-lg border border-(--color-border) px-2.5 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted) disabled:opacity-50"
                  >
                    Seçimi kapat
                  </button>
                </div>
              </>
            )}
          </div>
          {selectMode && !bulk && !selectHint && (
            <p className="text-[11px] text-(--color-text-muted)">
              Takvimdeki paylaşımlara tıklayarak seç. Soluk görünenler planlanamaz (üzerine gelince nedeni görünür).
            </p>
          )}
          {selectHint && <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">{selectHint}</p>}
          {bulk && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-surface-muted)">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${bulk.running ? "bg-sky-500" : bulk.results.every((r) => r.ok) ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.round((bulk.done / Math.max(bulk.total, 1)) * 100)}%` }}
                />
              </div>
              {bulk.running ? (
                <p className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
                  <Loader2 size={12} className="animate-spin" />
                  Planlanıyor {Math.min(bulk.done + 1, bulk.total)}/{bulk.total}: {bulk.current} — sayfayı kapatma.
                </p>
              ) : (
                <p className="text-xs font-semibold">
                  {bulk.results.filter((r) => r.ok).length}/{bulk.total} paylaşım Meta&apos;da planlandı
                  {bulk.results.some((r) => !r.ok) ? `, ${bulk.results.filter((r) => !r.ok).length} tanesi planlanamadı (seçili bırakıldı).` : "."}
                </p>
              )}
              {bulk.results.some((r) => !r.ok) && (
                <ul className="space-y-0.5 text-[11px]">
                  {bulk.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.id} className="text-brand-600">
                        {r.title}: {r.message}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {legend.map((l) => (
            <li key={l.name} className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface)">
        <div className="grid grid-cols-7 border-b border-(--color-border) bg-(--color-surface-muted)">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-1 py-2 text-center text-[11px] font-semibold uppercase text-(--color-text-muted)"
            >
              {d}
            </div>
          ))}
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragId(null)}
        >
        <div className="grid grid-cols-7">
          {days.map(({ date, inMonth }, idx) => {
            const dayPosts = postsByDate.get(date) ?? [];
            const isToday = date === today;
            const dayNumber = Number(date.slice(8));
            const border = `${idx % 7 !== 6 ? "border-r" : ""} ${idx < days.length - 7 ? "border-b" : ""} border-(--color-border)`;
            const interactive = canEdit || dayPosts.length > 0;

            return (
              <DayCell
                key={date}
                date={date}
                droppable={dragEnabled}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={() => {
                  if (selectMode) return;
                  if (canEdit) openAdd(date);
                  else if (dayPosts.length > 0) setDayList(date);
                }}
                onKeyDown={(e) => {
                  if (selectMode || !interactive || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  if (canEdit) openAdd(date);
                  else setDayList(date);
                }}
                className={`group min-h-[88px] min-w-0 p-1 sm:min-h-[124px] sm:p-1.5 ${border} ${
                  inMonth ? "" : "bg-(--color-surface-muted)/60"
                } ${interactive ? "cursor-pointer hover:bg-(--color-surface-muted)/60" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                      isToday
                        ? "bg-brand-600 text-white"
                        : inMonth
                          ? ""
                          : "text-(--color-text-muted)"
                    }`}
                  >
                    {dayNumber}
                  </span>
                  {canEdit && (
                    <Plus
                      size={13}
                      className="hidden text-(--color-text-muted) opacity-0 group-hover:opacity-100 sm:block"
                    />
                  )}
                </div>

                <div className="space-y-0.5">
                  {dayPosts.map((p, i) =>
                    selectMode ? (
                      <PostChip
                        key={p.id}
                        p={p}
                        index={i}
                        draggable={false}
                        onOpen={() => toggleSelect(p)}
                        select={{ selected: selected.includes(p.id), problem: bulkProblem(p) }}
                      />
                    ) : (
                      <PostChip key={p.id} p={p} index={i} draggable={dragEnabled} onOpen={() => setViewId(p.id)} />
                    )
                  )}
                  {!selectMode && dayPosts.length > 2 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayList(date);
                      }}
                      className="w-full rounded px-1 text-left text-[10px] font-medium text-(--color-text-muted) hover:underline sm:hidden"
                    >
                      +{dayPosts.length - 2} daha
                    </button>
                  )}
                  {!selectMode && dayPosts.length > 3 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayList(date);
                      }}
                      className="hidden w-full rounded px-1 text-left text-xs font-medium text-(--color-text-muted) hover:underline sm:block"
                    >
                      +{dayPosts.length - 3} daha
                    </button>
                  )}
                </div>
              </DayCell>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragPost ? (
            <div className="w-28 shadow-lg sm:w-40">
              <PostChip p={dragPost} index={0} draggable={false} overlay />
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      </div>
      {moveError && (
        <p className="rounded-lg bg-brand-50 p-2 text-xs font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-200">
          {moveError}
        </p>
      )}

      <SharePostView
        post={viewPost}
        canEdit={canEdit}
        viewOnly={viewOnly}
        canMark={!viewOnly}
        onClose={() => setViewId(null)}
        onEdit={() => {
          if (!viewPost) return;
          setViewId(null);
          setForm({ mode: "edit", post: viewPost });
        }}
      />
      <SharePostForm target={form} clients={clients} onClose={() => setForm(null)} />
      <DayListDialog
        date={dayList}
        posts={dayList ? (postsByDate.get(dayList) ?? []) : []}
        canEdit={canEdit}
        onClose={() => setDayList(null)}
        onOpenPost={(id) => {
          setDayList(null);
          setViewId(id);
        }}
        onAdd={openAdd}
      />
    </div>
  );
}
