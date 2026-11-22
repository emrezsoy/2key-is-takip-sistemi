"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Film, ImagePlus, ListPlus, Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import {
  createContentItem,
  createJobFromContentItem,
  deleteContentItem,
  removeContentItemFile,
  updateContentItem,
} from "@/lib/actions/content";
import { CONTENT_TYPES, CONTENT_TYPE_LABEL } from "@/lib/contentTypes";
import { monthTitle } from "@/lib/portalText";
import { DeliveryBox, type DeliveryInfo } from "@/components/delivery/DeliveryBox";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { UploadBar } from "@/components/ui/UploadBar";
import { uploadWithProgress, type UploadProgress } from "@/lib/useUploader";
import { SendToCalendarDialog } from "@/components/share/SendToCalendarDialog";

export type ItemRow = {
  id: string;
  title: string;
  details: string;
  note: string;
  /** İçerik türü kodu (boş = seçilmemiş). */
  contentType: string;
  /** "İş olarak ekle" ile iş listesine alınmış ve iş hâlâ duruyor. */
  inJob: boolean;
  files: RefFile[];
  createdByName: string | null;
  /** "Tamamlanan" sütunu: ekibin gönderdiği teslim (elle düzenlenemez). */
  delivery: DeliveryInfo | null;
};

export type RefFile = { id: string; url: string; name: string };

type Row = {
  key: string;
  id: string | null;
  title: string;
  details: string;
  note: string;
  contentType: string;
  inJob: boolean;
  files: RefFile[];
  createdByName: string | null;
  delivery: DeliveryInfo | null;
  /** Sunucuya son kaydedilen değerler (değişiklik var mı diye karşılaştırmak için). */
  saved: { title: string; details: string; note: string; contentType: string };
  busy: boolean;
  error: string | null;
};

const toRow = (i: ItemRow): Row => ({
  key: i.id,
  id: i.id,
  title: i.title,
  details: i.details,
  note: i.note,
  contentType: i.contentType,
  inJob: i.inJob,
  files: i.files,
  createdByName: i.createdByName,
  delivery: i.delivery,
  saved: { title: i.title, details: i.details, note: i.note, contentType: i.contentType },
  busy: false,
  error: null,
});

const isVideo = (name: string | null) => !!name && /\.(mp4|mov|webm|m4v)$/i.test(name);

const cell =
  "w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none hover:border-(--color-border) focus:border-brand-500 focus:bg-(--color-bg)";

export function ContentTable({
  clientId,
  year,
  month,
  items,
  canEdit,
  canAddJob = false,
  canReview = false,
  canRevise = false,
  canSendCalendar = false,
  canClearDelivery = false,
  clientView = false,
}: {
  clientId: string;
  year: number;
  month: number;
  items: ItemRow[];
  canEdit: boolean;
  /** Sadece admin ve müşterinin sorumlusu: satırı iş listesine ekleyebilir. */
  canAddJob?: boolean;
  /** Müşteri paneli: tamamlanan işi onaylayabilir. */
  canReview?: boolean;
  /** Müşteri paneli: tamamlanan iş için revize isteyebilir. */
  canRevise?: boolean;
  /** Ekip: müşterinin onayladığı teslimi paylaşım takvimine gönderebilir. */
  canSendCalendar?: boolean;
  /** Ekip: yanlış gönderilen teslimi kaldırabilir. */
  canClearDelivery?: boolean;
  /** Müşteri paneli: iş olarak eklenmiş (işleme alınmış) satırlar artık değiştirilemez. */
  clientView?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [seenItems, setSeenItems] = useState(items);
  const counter = useRef(0);
  // Henüz kaydedilmemiş bir satır için devam eden "oluştur" isteği: aynı satır için ikinci bir kayıt açılmasın.
  const creating = useRef(new Map<string, Promise<string>>());
  // Satır başına devam eden dosya yüklemesinin ilerlemesi.
  const [progressByRow, setProgressByRow] = useState<Record<string, UploadProgress | null>>({});
  // İşleme alınan satır müşteri tarafında kilitlidir; değiştirmeye çalışınca açıklama penceresi çıkar.
  const [lockedOpen, setLockedOpen] = useState(false);
  const lockedDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (lockedOpen) lockedDialogRef.current?.showModal();
    else lockedDialogRef.current?.close();
  }, [lockedOpen]);
  const lockedRow = (row: { inJob: boolean }) => clientView && canEdit && row.inJob;
  const guard = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLockedOpen(true);
  };
  // Kilitli satırdaki alanlara tıklama, yazma, yapıştırma ve sürükleme engellenir (Tab ile gezinmeye izin verilir).
  // Not: pointerdown dinlenmez; dokunmatik ekranda parmak değer değmez başlar ve kaydırma henüz belli olmadığı için
  // sayfayı kaydırırken uyarı çıkıyordu. mousedown/click ise dokunmatikte yalnızca gerçek dokunuşta (kaydırmada değil) oluşur,
  // fareyle ise basar basmaz çalışır; odaklanma (klavye açılması) mousedown'ın varsayılanı olduğu için yine engellenir.
  const lockHandlers = {
    onMouseDownCapture: guard,
    onClickCapture: guard,
    onPasteCapture: guard,
    onCutCapture: guard,
    onDropCapture: guard,
    onKeyDownCapture: (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" && e.key !== "Shift") guard(e);
    },
  };
  const [calendarItem, setCalendarItem] = useState<{ itemId: string; files: { url: string; name: string }[] } | null>(null);

  // Sunucudan başka biri tarafından eklenen yeni satırları, yerel düzenlemeleri bozmadan listeye kat.
  if (items !== seenItems) {
    setSeenItems(items);
    setRows((cur) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      // Teslim durumu ve "işte" bilgisi sunucudan gelir (yerel düzenlemeler bozulmaz).
      const synced = cur.map((r) => {
        const n = r.id ? byId.get(r.id) : undefined;
        return n ? { ...r, delivery: n.delivery, inJob: n.inJob } : r;
      });
      const known = new Set(cur.map((r) => r.id).filter(Boolean));
      const added = items.filter((i) => !known.has(i.id)).map(toRow);
      return added.length > 0 ? [...synced, ...added] : synced;
    });
  }

  const patch = (key: string, p: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const addRow = () =>
    setRows((cur) => [
      ...cur,
      {
        key: `new-${counter.current++}`,
        id: null,
        title: "",
        details: "",
        note: "",
        contentType: "",
        inJob: false,
        files: [],
        createdByName: null,
        delivery: null,
        saved: { title: "", details: "", note: "", contentType: "" },
        busy: false,
        error: null,
      },
    ]);

  const commit = async (row: Row) => {
    if (lockedRow(row)) return setLockedOpen(true);
    const dirty =
      row.title !== row.saved.title ||
      row.details !== row.saved.details ||
      row.note !== row.saved.note ||
      row.contentType !== row.saved.contentType;
    if (!dirty) return;
    if (!row.title.trim()) {
      // Başlıksız satır kaydedilemez: sessizce atlamak yerine kullanıcıyı uyar.
      const hasContent = !!(row.details.trim() || row.note.trim() || row.contentType);
      if (row.id || hasContent) patch(row.key, { error: "Bu satırın kaydedilmesi için bir başlık yazın." });
      return;
    }
    patch(row.key, { busy: true, error: null });
    try {
      const fields = { title: row.title, details: row.details, note: row.note, contentType: row.contentType };
      if (row.id) {
        await updateContentItem(row.id, fields);
        patch(row.key, { busy: false, saved: { ...fields } });
      } else {
        const inflight = creating.current.get(row.key);
        if (inflight) {
          // Aynı satır zaten oluşturuluyor (ör. başlıktan çıkış + tür seçimi): oluşunca güncel değerlerle güncelle.
          const id = await inflight;
          await updateContentItem(id, fields);
          patch(row.key, { id, busy: false, saved: { ...fields } });
        } else {
          const created = createContentItem(clientId, year, month, fields);
          creating.current.set(row.key, created);
          const id = await created;
          patch(row.key, { id, busy: false, saved: { ...fields } });
        }
      }
    } catch (e) {
      patch(row.key, { busy: false, error: e instanceof Error ? e.message : "Kaydedilemedi." });
    }
  };

  const upload = async (row: Row, picked: File[]) => {
    if (lockedRow(row)) return setLockedOpen(true);
    if (!row.id) {
      patch(row.key, { error: "Önce başlığı yazın." });
      return;
    }
    patch(row.key, { busy: true, error: null });
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      const added = await uploadWithProgress<RefFile[]>("addContentItemFiles", [row.id], fd, (p) =>
        setProgressByRow((cur) => ({ ...cur, [row.key]: p }))
      );
      setRows((cur) => cur.map((r) => (r.key === row.key ? { ...r, busy: false, files: [...r.files, ...added] } : r)));
    } catch (e) {
      patch(row.key, { busy: false, error: e instanceof Error ? e.message : "Dosya yüklenemedi." });
    } finally {
      setProgressByRow((cur) => ({ ...cur, [row.key]: null }));
    }
  };

  const removeFile = async (row: Row, fileId: string) => {
    if (lockedRow(row)) return setLockedOpen(true);
    patch(row.key, { busy: true, error: null });
    try {
      await removeContentItemFile(fileId);
      setRows((cur) =>
        cur.map((r) => (r.key === row.key ? { ...r, busy: false, files: r.files.filter((f) => f.id !== fileId) } : r))
      );
    } catch (e) {
      patch(row.key, { busy: false, error: e instanceof Error ? e.message : "Kaldırılamadı." });
    }
  };

  const addAsJob = async (row: Row) => {
    if (!row.id || row.busy) return;
    patch(row.key, { busy: true, error: null });
    try {
      await createJobFromContentItem(row.id);
      patch(row.key, { busy: false, inJob: true });
    } catch (e) {
      patch(row.key, { busy: false, error: e instanceof Error ? e.message : "İş eklenemedi." });
    }
  };

  const jobButton = (row: Row, compact: boolean) =>
    !canAddJob ? null : row.inJob ? (
      <span
        className={`flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-1 text-[10px] font-semibold leading-tight text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ${compact ? "" : "w-full justify-center text-center"}`}
        title="Bu içerik iş listesine eklendi"
      >
        <Check size={11} className="shrink-0" /> İşte
      </span>
    ) : (
      <button
        type="button"
        onClick={() => void addAsJob(row)}
        disabled={!row.id || row.busy}
        title={row.id ? "Bu içeriği müşterinin iş listesine ekle" : "Önce başlığı yazıp kaydedin"}
        className={`flex items-center justify-center gap-1 rounded-md border border-(--color-border) px-1.5 py-1 text-[10px] font-semibold leading-tight text-(--color-text-muted) hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 ${compact ? "" : "w-full flex-col"}`}
      >
        <ListPlus size={compact ? 13 : 14} className="shrink-0" />
        İş olarak ekle
      </button>
    );

  const remove = async (row: Row) => {
    if (lockedRow(row)) return setLockedOpen(true);
    if (row.id) {
      if (!window.confirm("Bu satır silinsin mi?")) return;
      patch(row.key, { busy: true });
      try {
        await deleteContentItem(row.id);
      } catch (e) {
        patch(row.key, { busy: false, error: e instanceof Error ? e.message : "Silinemedi." });
        return;
      }
    }
    setRows((cur) => cur.filter((r) => r.key !== row.key));
  };

  const GRID = "xl:grid-cols-[2rem_minmax(0,1.1fr)_8rem_minmax(0,1.7fr)_10rem_minmax(0,1fr)_12.5rem_4.5rem]";
  const mobileLabel = "mb-0.5 block px-2 text-[11px] font-semibold uppercase text-(--color-text-muted) xl:hidden";

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface)">
        <div className={`hidden gap-2 bg-(--color-surface-muted) px-3 py-3 text-xs font-semibold uppercase text-(--color-text-muted) xl:grid ${GRID}`}>
          <span>#</span>
          <span>Başlık</span>
          <span>İçerik türü</span>
          <span>İçerik detayları</span>
          <span>Referans görseller / videolar</span>
          <span>Not</span>
          <span>Tamamlanan</span>
          <span />
        </div>

        <div className="divide-y divide-(--color-border)">
          {rows.map((row, idx) => {
            const locked = lockedRow(row);
            const lk = locked ? lockHandlers : {};
            return (
            <div key={row.key} className={`grid grid-cols-1 gap-2 p-3 xl:items-start ${GRID} ${row.busy ? "opacity-70" : ""}`}>
              <div className="flex items-center justify-between xl:block">
                <span className="text-xs font-semibold text-(--color-text-muted)">
                  <span className="xl:hidden">Satır </span>
                  {idx + 1}
                </span>
                {locked && (
                  <span
                    title="Bu içerik işleme alındı, değişiklik yapılamaz"
                    className="mt-1 flex w-fit items-center gap-1 rounded-md bg-(--color-surface-muted) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-text-muted)"
                  >
                    <Lock size={10} /> İşte
                  </span>
                )}
                <div className="flex items-center gap-2 xl:hidden">
                  {jobButton(row, true)}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void remove(row)}
                      aria-label="Satırı sil"
                      className="rounded p-1 text-(--color-text-muted) hover:text-brand-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="min-w-0" {...lk}>
                <span className={mobileLabel}>Başlık</span>
                {canEdit ? (
                  <textarea
                    rows={2}
                    readOnly={locked}
                    value={row.title}
                    maxLength={160}
                    onChange={(e) => patch(row.key, { title: e.target.value, error: e.target.value.trim() ? null : row.error })}
                    onBlur={() => void commit(row)}
                    placeholder="Başlık"
                    aria-invalid={!row.title.trim() && !!row.error}
                    className={`${cell} font-medium ${!row.title.trim() && row.error ? "!border-red-500 ring-1 ring-red-500" : ""}`}
                  />
                ) : (
                  <p className="break-words px-2 py-1.5 font-medium">{row.title}</p>
                )}
                {row.createdByName && <p className="px-2 text-[10px] text-(--color-text-muted)">{row.createdByName}</p>}
              </div>

              <div className="min-w-0" {...lk}>
                <span className={mobileLabel}>İçerik türü</span>
                {canEdit ? (
                  <select
                    value={row.contentType}
                    onChange={(e) => {
                      const next = { ...row, contentType: e.target.value };
                      patch(row.key, { contentType: e.target.value });
                      void commit(next);
                    }}
                    aria-label="İçerik türü"
                    className={`${cell} cursor-pointer text-xs`}
                  >
                    <option value="">Tür seçin</option>
                    {CONTENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                ) : row.contentType ? (
                  <span className="mx-2 inline-block rounded-md bg-(--color-surface-muted) px-2 py-1 text-xs font-semibold">
                    {CONTENT_TYPE_LABEL[row.contentType] ?? row.contentType}
                  </span>
                ) : (
                  <span className="px-2 text-xs text-(--color-text-muted)">—</span>
                )}
              </div>

              <div className="min-w-0" {...lk}>
                <span className={mobileLabel}>İçerik detayları</span>
                {canEdit ? (
                  <textarea
                    rows={4}
                    readOnly={locked}
                    value={row.details}
                    onChange={(e) => patch(row.key, { details: e.target.value })}
                    onBlur={() => void commit(row)}
                    placeholder="İçerik detayları"
                    className={cell}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words px-2 py-1.5">{row.details}</p>
                )}
              </div>

              <FileDropZone disabled={!canEdit || locked} onFiles={(f) => void upload(row, f)} className="min-w-0 rounded-lg px-2" label="Dosyaları bırakın">
                <span className="mb-1 block text-[11px] font-semibold uppercase text-(--color-text-muted) xl:hidden">
                  Referans görseller / videolar
                </span>
                <UploadBar progress={progressByRow[row.key] ?? null} label="Yükleniyor" className="mb-1.5" />
                <div className="flex flex-wrap gap-1.5" {...lk}>
                  {row.files.map((f) => (
                    <div key={f.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                      <a href={f.url} target="_blank" rel="noreferrer" title={f.name} className="block h-full w-full">
                        {isVideo(f.name) ? (
                          <video src={`${f.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
                        )}
                      </a>
                      {isVideo(f.name) && (
                        <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 p-0.5 text-white">
                          <Film size={10} />
                        </span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void removeFile(row, f.id)}
                          aria-label="Dosyayı kaldır"
                          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-(--color-border) text-[10px] text-(--color-text-muted) hover:bg-(--color-surface-muted)">
                      {row.busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                      Ekle
                      <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                        className="sr-only"
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (picked.length > 0) void upload(row, picked);
                        }}
                      />
                    </label>
                  )}
                  {!canEdit && row.files.length === 0 && <span className="text-xs text-(--color-text-muted)">—</span>}
                </div>
              </FileDropZone>

              <div className="min-w-0" {...lk}>
                <span className={mobileLabel}>Not</span>
                {canEdit ? (
                  <textarea
                    rows={3}
                    readOnly={locked}
                    value={row.note}
                    onChange={(e) => patch(row.key, { note: e.target.value })}
                    onBlur={() => void commit(row)}
                    placeholder="Not"
                    className={cell}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words px-2 py-1.5 text-(--color-text-muted)">{row.note}</p>
                )}
              </div>

              <div className="min-w-0 px-2 xl:px-0">
                <span className={mobileLabel}>Tamamlanan</span>
                <DeliveryBox
                  target={{ type: "item", id: row.id ?? "" }}
                  delivery={row.id ? row.delivery : null}
                  title={row.title}
                  subtitle={monthTitle(year, month)}
                  canReview={canReview}
                  canRevise={canRevise}
                  canClear={canClearDelivery}
                  canTeamRevise={canClearDelivery}
                  reviewOnThumbClick
                  emptyText="Henüz tamamlanmadı"
                  extra={
                    canSendCalendar && row.delivery?.status === "APPROVED" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarItem({
                            itemId: row.id ?? "",
                            files: (row.delivery?.files ?? []).map((f) => ({ url: f.url, name: f.name })),
                          })
                        }
                        className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        <CalendarPlus size={13} />
                        Paylaşım takvimine gönder
                      </button>
                    ) : undefined
                  }
                />
              </div>

              <div className="hidden flex-col items-end gap-2 xl:flex">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    aria-label="Satırı sil"
                    className="rounded p-1 text-(--color-text-muted) hover:text-brand-600"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                {jobButton(row, false)}
              </div>
            </div>
            );
          })}
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-(--color-text-muted)">Bu ay için içerik satırı yok.</p>
          )}
        </div>
      </div>
      {rows.some((r) => r.error) && (
        <p className="text-xs text-brand-600">{rows.find((r) => r.error)?.error}</p>
      )}
      <dialog
        ref={lockedDialogRef}
        onClose={() => setLockedOpen(false)}
        className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <div className="space-y-3 p-5 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Lock size={20} />
          </div>
          <h2 className="text-base font-bold">İçerik işleme alındı</h2>
          <p className="text-sm text-(--color-text-muted)">
            Ekibimiz bu içerik üzerinde çalışmaya başladığı için artık değişiklik yapılamıyor. Bir değişiklik gerekiyorsa lütfen bizimle iletişime geçin.
          </p>
          <button
            type="button"
            onClick={() => setLockedOpen(false)}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Tamam
          </button>
        </div>
      </dialog>
      {calendarItem && (
        <SendToCalendarDialog
          source={{ kind: "item", itemId: calendarItem.itemId }}
          files={calendarItem.files}
          onClose={() => setCalendarItem(null)}
        />
      )}
      {canEdit && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-(--color-border) px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:border-brand-500 hover:text-brand-600"
        >
          <Plus size={15} />
          Satır ekle
        </button>
      )}
    </div>
  );
}
