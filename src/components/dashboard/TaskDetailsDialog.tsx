"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BadgeCheck, X, Paperclip, CheckCircle2, RotateCcw, Upload, Download, Pencil, Play, Send, CalendarPlus, ListChecks, MessageSquareReply, Trash2, GripVertical, Replace } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDate, STATUS_LABEL, URGENCY_LABEL, URGENCY_STYLE } from "@/lib/format";
import { approveTask, reorderSubmissions, reviseTask, setTaskCaption, updateTaskStatus } from "@/lib/actions/tasks";
import { RevisionEditor } from "@/components/delivery/RevisionEditor";
import { updateJob, deleteJob } from "@/lib/actions/clientJobs";
import { deleteRequestFiles, deleteSubmissionFiles, deleteTaskReferenceFiles } from "@/lib/actions/fileRemoval";
import { joinJobText } from "@/lib/jobText";
import { REVISION_SOURCE_LABEL, lastRevisionBy, splitRevisionBlocks } from "@/lib/revisionNote";
import { UrgencyPicker } from "@/components/board/UrgencyPicker";
import { useCanEditShareCalendar } from "@/components/share/ShareEditContext";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { SendToCalendarDialog } from "@/components/share/SendToCalendarDialog";
import { SendToContentDialog, SendToRequestDialog } from "@/components/delivery/SendDeliveryDialogs";
import type { CardTask } from "./TaskCard";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
const isDriveUrl = (url: string) => url.startsWith("/api/files/");

const isMediaName = (name: string) => IMAGE_EXT.test(name) || VIDEO_EXT.test(name);

function SelectToggle({
  name,
  order,
  onToggle,
}: {
  name: string;
  order: number;
  onToggle: () => void;
}) {
  const selected = order > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={selected ? `${name} seçimini kaldır` : `${name} dosyasını seç`}
      aria-pressed={selected}
      className={`absolute left-1.5 top-1.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-full border text-[11px] font-bold ${
        selected
          ? "border-brand-600 bg-brand-600 px-1 text-white"
          : "border-white/80 bg-black/40 text-transparent hover:bg-black/60"
      }`}
    >
      {selected ? order : "•"}
    </button>
  );
}

/** Drive'daki teslim dosyası: görsel küçük resim, video oynatıcı, diğerleri indirme bağlantısı.
 * (Eski sunucu dosyalarına dokunulmaz; onlar indirilince silindiği için önizlenmez.) */
function DeleteX({ name, onDelete, disabled }: { name: string; onDelete: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={disabled}
      aria-label={`${name} dosyasını sil`}
      title="Bu dosyayı sil"
      className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-brand-600 disabled:opacity-50"
    >
      <Trash2 size={12} />
    </button>
  );
}

function FileThumb({
  url,
  name,
  selectOrder,
  onToggle,
  onDelete,
  handle,
}: {
  url: string;
  name: string;
  /** Sıralama tutamacı (görselin üst ortasında). */
  handle?: React.ReactNode;
  /** Seçili görselin kaçıncı sırada olduğu (1'den başlar); 0 = seçili değil. undefined = seçilemez. */
  selectOrder?: number;
  onToggle?: () => void;
  /** Verilirse köşede tek dosyayı silen düğme çıkar. */
  onDelete?: () => void;
}) {
  if (IMAGE_EXT.test(name)) {
    const selected = !!selectOrder;
    return (
      <div className="relative">
        <a href={url} target="_blank" rel="noreferrer" title={name} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            loading="lazy"
            className={`h-28 w-full rounded-lg border object-cover ${
              selected ? "border-brand-500 ring-2 ring-brand-500" : "border-(--color-border)"
            }`}
          />
          <span className="mt-0.5 block truncate text-[11px] text-(--color-text-muted)">{name}</span>
        </a>
        {onToggle && <SelectToggle name={name} order={selectOrder ?? 0} onToggle={onToggle} />}
        {onDelete && <DeleteX name={name} onDelete={onDelete} />}
        {handle}
      </div>
    );
  }
  if (VIDEO_EXT.test(name)) {
    return (
      <div className="relative col-span-2">
        <video
          src={url}
          controls
          preload="metadata"
          className={`max-h-56 w-full rounded-lg border bg-black ${
            selectOrder ? "border-brand-500 ring-2 ring-brand-500" : "border-(--color-border)"
          }`}
        />
        {onToggle && <SelectToggle name={name} order={selectOrder ?? 0} onToggle={onToggle} />}
        {onDelete && <DeleteX name={name} onDelete={onDelete} />}
        {handle}
        <span className="mt-0.5 block truncate text-[11px] text-(--color-text-muted)">{name}</span>
      </div>
    );
  }
  return (
    <div className="relative">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium text-brand-600 hover:underline ${
          selectOrder ? "border-brand-500 ring-2 ring-brand-500" : "border-(--color-border)"
        } ${onToggle || onDelete ? "pl-9 pr-9" : ""}`}
      >
        <Download size={13} className="shrink-0" />
        <span className="truncate">{name}</span>
      </a>
      {onToggle && <SelectToggle name={name} order={selectOrder ?? 0} onToggle={onToggle} />}
      {onDelete && <DeleteX name={name} onDelete={onDelete} />}
    </div>
  );
}

/** Teslim dosyası küçük resmi; tutamacından sürüklenince sırası değişir. `index` 0 = kapak. */
function SortableThumb({
  id,
  index,
  url,
  name,
  selectOrder,
  onToggle,
}: {
  id: string;
  index: number;
  url: string;
  name: string;
  selectOrder?: number;
  onToggle?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${VIDEO_EXT.test(name) ? "col-span-2" : ""} ${isDragging ? "relative z-30 opacity-80 shadow-xl" : ""}`}
    >
      <FileThumb
        url={url}
        name={name}
        selectOrder={selectOrder}
        onToggle={onToggle}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`${name} dosyasının sırasını değiştir (şu an ${index + 1}. sırada)`}
            title="Sürükleyerek sırayı değiştir"
            className="absolute left-1/2 top-1.5 z-10 flex -translate-x-1/2 cursor-grab touch-none items-center gap-0.5 rounded-full bg-black/60 py-0.5 pl-1 pr-2 text-[11px] font-bold text-white hover:bg-brand-600 active:cursor-grabbing"
          >
            <GripVertical size={12} />
            {index === 0 ? "Kapak" : index + 1}
          </button>
        }
      />
    </div>
  );
}

export function TaskDetailsDialog({
  task,
  clientName,
  assigneeName,
  role,
  open,
  onClose,
  canReview: canReviewOverride,
  canManage = false,
  canWork = true,
  showStatusActions = false,
  canUpload = false,
  canSend = false,
}: {
  task: CardTask;
  clientName: string | null;
  assigneeName: string;
  role: "admin" | "employee";
  open: boolean;
  onClose: () => void;
  /** Müşteri panosundan açıldığında onay yetkisini dışarıdan belirler. */
  canReview?: boolean;
  /** İş metni/aciliyet düzenleme ve silme (admin ve müşteri sorumlusu). */
  canManage?: boolean;
  /** Çalışan bu işi yapabilir mi (dosya yükleme ve durum butonları). Başkasına atanmış, sadece incelenen işlerde false. */
  canWork?: boolean;
  /** Çalışan listesinde "Çalışmaya başla" / "Onaya gönder" butonlarını gösterir. */
  showStatusActions?: boolean;
  /** Müşteri kutusundan (admin / müşteri sorumlusu): teslim dosyası yükleyebilir. */
  canUpload?: boolean;
  /** Müşteri kutusundan (admin / müşteri sorumlusu): teslim dosyalarını müşterinin paylaşım takvimine gönderebilir. */
  canSend?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reviseDialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const subUp = useUploader();
  const uploadPending = subUp.uploading;
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reviseNote, setReviseNote] = useState("");
  // Çizimli revize (müşteri revizesiyle aynı ekran): teslimde görsel/video varsa bu açılır.
  const annotRef = useRef<HTMLDialogElement>(null);
  const [annotating, setAnnotating] = useState(false);
  const revisedRef = useRef(false);
  const revUp = useUploader();
  const [caption, setCaption] = useState(task.caption ?? "");
  const [captionSaved, setCaptionSaved] = useState(task.caption ?? "");
  const [captionMsg, setCaptionMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const canSendToCalendar = useCanEditShareCalendar() || canSend;
  const [selected, setSelected] = useState<string[]>([]);
  const [sendOpen, setSendOpen] = useState<null | "calendar" | "content" | "request">(null);

  // Paylaşım takvimine sadece çalışanın TESLİM ettiği görsel/videolar gönderilebilir.
  // İşi verenin eklediği referans dosyalar bu listede yer almaz.
  const sendable: { url: string; name: string }[] = task.submissions
    .filter((x) => x.fileUrl && isDriveUrl(x.fileUrl) && isMediaName(x.fileName))
    .map((x) => ({ url: x.fileUrl as string, name: x.fileName }));
  const references: { url: string; name: string; id?: string; legacy?: boolean }[] = [
    ...(task.fileUrl ? [{ url: task.fileUrl, name: task.fileName ?? "Dosya eki", legacy: true }] : []),
    ...(task.attachments ?? []),
  ];
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [confirmRemoveSel, setConfirmRemoveSel] = useState(false);
  const removeReference = (f: { id?: string; name: string; legacy?: boolean }) => {
    if (!window.confirm(`"${f.name}" silinsin mi?`)) return;
    runRemove(() => deleteTaskReferenceFiles(task.id, f.id ? [f.id] : [], !!f.legacy));
  };
  const runRemove = (fn: () => Promise<unknown>, after?: () => void) => {
    setRemoveError(null);
    startRemove(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        setRemoveError(e instanceof Error ? e.message : "Dosya silinemedi.");
      }
    });
  };
  const refUp = useUploader();
  const refUploading = refUp.uploading;
  const [refError, setRefError] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const uploadRefs = async (picked: File[]) => {
    if (picked.length === 0 || refUp.uploading) return;
    setRefError(null);
    try {
      const formData = new FormData();
      picked.forEach((file) => formData.append("files", file));
      await refUp.run("addTaskAttachments", [task.id], formData);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "Dosya eklenemedi.");
    } finally {
      if (refInputRef.current) refInputRef.current.value = "";
    }
  };
  const handleRefChange = (e: React.ChangeEvent<HTMLInputElement>) => uploadRefs(Array.from(e.target.files ?? []));
  const toggleSelect = (url: string) =>
    setSelected((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  const orderOf = (url: string) => selected.indexOf(url) + 1;

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  const canReview =
    (canReviewOverride ?? role === "admin") && task.status === "PENDING_APPROVAL";
  // Tamamlanmış ya da teslim dosyası yüklenmiş işe müşteriye gitmeden de (gitmişse onaylanmadan) yönetici revizesi verilebilir.
  const canReviseLater =
    (canReviewOverride ?? role === "admin") &&
    (task.status === "DONE" || (task.status === "IN_PROGRESS" && task.submissions.length > 0));
  const canEditJob = canManage && task.status !== "DONE";
  const canDeleteJob =
    canManage && task.status === "TODO" && task.submissions.length === 0;

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteJob(task.id);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Silinemedi.");
        setConfirmingDelete(false);
      }
    });
  };

  const handleStatus = (status: "IN_PROGRESS" | "PENDING_APPROVAL") => {
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, status);
        if (status === "PENDING_APPROVAL") onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      }
    });
  };

  const handleApprove = () => {
    setError(null);
    startTransition(async () => {
      try {
        await approveTask(task.id);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      }
    });
  };

  const openRevise = () => {
    setReviseNote("");
    setError(null);
    if (sendable.length > 0) {
      setAnnotating(true);
      annotRef.current?.showModal();
      return;
    }
    reviseDialogRef.current?.showModal();
  };
  const closeAnnot = () => {
    annotRef.current?.close();
    setAnnotating(false);
  };
  const saveCaption = () => {
    if (caption === captionSaved) return;
    setCaptionMsg(null);
    startTransition(async () => {
      try {
        await setTaskCaption(task.id, caption);
        setCaptionSaved(caption);
        setCaptionMsg("Kaydedildi.");
      } catch (e) {
        setCaptionMsg(e instanceof Error ? e.message : "Kaydedilemedi.");
      }
    });
  };

  const handleRevise = () => {
    if (!reviseNote.trim()) {
      setError("Revize notu zorunludur.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await reviseTask(task.id, reviseNote);
        reviseDialogRef.current?.close();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      }
    });
  };

  const uploadSubmissions = async (picked: File[]) => {
    if (picked.length === 0 || subUp.uploading) return;
    setUploadError(null);
    try {
      const formData = new FormData();
      picked.forEach((file) => formData.append("file", file));
      await subUp.run("submitTaskFile", [task.id], formData);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Dosya yüklenemedi.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => uploadSubmissions(Array.from(e.target.files ?? []));
  // Teslim dosyası yükleyebilen kişi: işi yapan çalışan ya da (iş bitmediyse) admin / müşteri sorumlusu.
  const canSubmitFiles = (role === "employee" && canWork) || (canUpload && task.status !== "DONE");
  // Yanlış yüklenen teslim dosyasını silebilen kişi: admin / müşteri sorumlusu (canManage) ya da işi yapan çalışan.
  const canRemoveSub = canSubmitFiles || canManage;
  const driveSubs = task.submissions.filter((x) => x.fileUrl && isDriveUrl(x.fileUrl));
  // Elle verilen sıra: sunucudan yeni sıra gelene kadar (imza değişene kadar) ekranda tutulur.
  const sortSig = driveSubs.map((x) => x.id).join(",");
  const [localOrder, setLocalOrder] = useState<{ sig: string; ids: string[] } | null>(null);
  const orderedSubs =
    localOrder && localOrder.sig === sortSig
      ? localOrder.ids.map((id) => driveSubs.find((x) => x.id === id)).filter((x): x is (typeof driveSubs)[number] => !!x)
      : driveSubs;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleSortEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = orderedSubs.map((x) => x.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setLocalOrder({ sig: sortSig, ids: next });
    setRemoveError(null);
    startRemove(async () => {
      try {
        await reorderSubmissions(task.id, next);
      } catch (err) {
        setLocalOrder(null);
        setRemoveError(err instanceof Error ? err.message : "Sıra kaydedilemedi.");
      }
    });
  };
  const toggleable = (name: string) => canRemoveSub || (canSendToCalendar && isMediaName(name));
  const selectableUrls = orderedSubs.filter((x) => toggleable(x.fileName)).map((x) => x.fileUrl as string);
  // İşaretlenen teslim dosyaları: yeni dosya bırakılırsa bunların yerine geçer.
  const selectedSubs = orderedSubs.filter((x) => selected.includes(x.fileUrl as string));
  const canReplace = canSubmitFiles && selectedSubs.length > 0;
  const [replaceMsg, setReplaceMsg] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceSelected = async (picked: File[]) => {
    if (picked.length === 0 || subUp.uploading || selectedSubs.length === 0) return;
    setUploadError(null);
    setReplaceMsg(null);
    try {
      const formData = new FormData();
      picked.forEach((file) => formData.append("file", file));
      formData.append("targets", JSON.stringify(selectedSubs.map((x) => x.id)));
      const res = await subUp.run<{ replaced: number; added: number } | null>("replaceSubmissionFiles", [task.id], formData);
      setSelected([]);
      setLocalOrder(null);
      if (res) {
        setReplaceMsg(
          `${res.replaced} dosya yenisiyle değiştirildi${res.added > 0 ? `, ${res.added} yeni dosya eklendi` : ""}.`
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Dosyalar değiştirilemedi.");
    } finally {
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };
  const selectedSendable = selected.filter((u) => sendable.some((f) => f.url === u));
  const removeSelectedSubs = () => {
    const ids = driveSubs.filter((x) => selected.includes(x.fileUrl as string)).map((x) => x.id);
    runRemove(() => deleteSubmissionFiles(task.id, ids), () => {
      setSelected([]);
      setConfirmRemoveSel(false);
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
    >
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-snug">{task.title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {canEditJob && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="İşi düzenle"
                className="rounded p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
              >
                <Pencil size={15} />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          {task.clientApproval && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/10 dark:text-emerald-300">
              <BadgeCheck size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Müşteri onayladı
                  {task.clientApproval.by ? ` (${task.clientApproval.by})` : ""}
                </p>
                <p className="mt-0.5 opacity-90">Bu işi paylaşım takvimine ekleyebilirsiniz.</p>
              </div>
            </div>
          )}
          {editing ? (
            <form
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  try {
                    await updateJob(task.id, formData);
                    setEditing(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Kaydedilemedi.");
                  }
                });
              }}
              className="space-y-3"
            >
              <textarea
                name="text"
                required
                rows={5}
                defaultValue={joinJobText(task.title, task.description)}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <UrgencyPicker defaultValue={task.urgency} />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {pending ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          ) : task.description ? (
            <p className="whitespace-pre-wrap text-(--color-text-muted)">
              {task.description}
            </p>
          ) : (
            <p className="text-(--color-text-muted) italic">Açıklama girilmemiş.</p>
          )}

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-(--color-text-muted)">Atanan kişi</dt>
              <dd className="font-medium">{assigneeName}</dd>
            </div>
            <div>
              <dt className="text-(--color-text-muted)">Müşteri</dt>
              <dd className="font-medium">{clientName ?? "—"}</dd>
            </div>
            {task.creatorLabel && (
              <div>
                <dt className="text-(--color-text-muted)">İşi veren</dt>
                <dd className="font-medium">{task.creatorLabel}</dd>
              </div>
            )}
            {lastRevisionBy(task.revisionNote) && (
              <div>
                <dt className="text-(--color-text-muted)">Son revizeyi veren</dt>
                <dd className="font-medium text-amber-700 dark:text-amber-300">{lastRevisionBy(task.revisionNote)}</dd>
              </div>
            )}
            <div>
              <dt className="text-(--color-text-muted)">Durum</dt>
              <dd className="font-medium">{STATUS_LABEL[task.status][role]}</dd>
            </div>
            <div>
              <dt className="text-(--color-text-muted)">Aciliyet</dt>
              <dd>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[task.urgency]}`}
                >
                  {URGENCY_LABEL[task.urgency]}
                </span>
              </dd>
            </div>
            {role === "admin" && task.difficulty && (
              <div>
                <dt className="text-(--color-text-muted)">Zorluk</dt>
                <dd className="font-medium">{task.difficulty}/5</dd>
              </div>
            )}
            {task.calculatedDeadline && (
              <div>
                <dt className="text-(--color-text-muted)">Teslim tarihi</dt>
                <dd className="font-medium">{formatDate(task.calculatedDeadline)}</dd>
              </div>
            )}
          </dl>

          {(references.length > 0 || canEditJob) && (
            <FileDropZone disabled={!canEditJob} onFiles={uploadRefs} className="rounded-lg" label="Referans dosyalarını bırakın">
            <div className="rounded-lg border border-(--color-border) p-3">
              <p className="mb-2 text-xs font-semibold text-(--color-text-muted)">
                Referans / kullanılacak dosyalar {references.length > 0 && `(${references.length})`}
              </p>
              {references.length === 0 && (
                <p className="mb-2 text-xs italic text-(--color-text-muted)">Referans dosyası eklenmemiş.</p>
              )}
              {references.length > 0 && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {references.map((f) =>
                    isDriveUrl(f.url) ? (
                      <FileThumb key={f.url} url={f.url} name={f.name} onDelete={canEditJob ? () => removeReference(f) : undefined} />
                    ) : (
                      <div key={f.url} className="relative">
                        <a
                          href={f.url}
                          className={`flex items-center gap-1.5 rounded-lg border border-(--color-border) px-2 py-2 text-xs font-medium text-brand-600 hover:underline ${canEditJob ? "pr-9" : ""}`}
                        >
                          <Paperclip size={13} className="shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </a>
                        {canEditJob && <DeleteX name={f.name} onDelete={() => removeReference(f)} disabled={removing} />}
                      </div>
                    )
                  )}
                </div>
              )}
              {canEditJob && (
                <>
                  <UploadBar progress={refUp.progress} label="Referans dosyaları yükleniyor" className="mb-2" />
                  <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold hover:bg-(--color-surface-muted)">
                    <Upload size={13} />
                    {refUploading ? "Yükleniyor..." : "Referans dosyası ekle"}
                    <input
                      ref={refInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      disabled={refUploading}
                      onChange={handleRefChange}
                    />
                  </label>
                  {refError && <p className="mt-2 text-xs text-brand-600">{refError}</p>}
                </>
              )}
            </div>
            </FileDropZone>
          )}

          {task.requestFiles && task.requestFiles.length > 0 && (
            <div className="rounded-lg border border-(--color-border) p-3">
              <p className="mb-2 text-xs font-semibold text-(--color-text-muted)">
                Müşterinin referans dosyaları ({task.requestFiles.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {task.requestFiles.map((f) => (
                  <FileThumb
                    key={f.id}
                    url={f.url}
                    name={f.name}
                    onDelete={
                      canManage && task.requestId
                        ? () => {
                            if (window.confirm(`"${f.name}" silinsin mi?`))
                              runRemove(() => deleteRequestFiles(task.requestId as string, [f.id]));
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {task.revisionNote && (() => {
            const { latest, older } = splitRevisionBlocks(task.revisionNote);
            return (
              <div className="space-y-2">
                {latest && (
                  <div
                    className={`rounded-lg border p-3 text-xs ${
                      latest.source === "CLIENT"
                        ? "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-900/50 dark:bg-violet-900/10 dark:text-violet-300"
                        : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300"
                    }`}
                  >
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 font-semibold">
                      <span className="rounded bg-current/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Güncel revize</span>
                      {latest.header ?? REVISION_SOURCE_LABEL[latest.source]}
                    </p>
                    <p className="whitespace-pre-wrap">{latest.body}</p>
                  </div>
                )}
                {older.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400"
                  >
                    <p className="mb-0.5 flex flex-wrap items-center gap-1.5 font-medium">
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Eski revize
                      </span>
                      {b.header ?? REVISION_SOURCE_LABEL[b.source]}
                    </p>
                    <p className="whitespace-pre-wrap">{b.body}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {task.revisionFiles && task.revisionFiles.some((f) => !f.old) && (
            <div className="rounded-lg border border-violet-300 bg-violet-50/50 p-3 dark:border-violet-900/50 dark:bg-violet-900/10">
              <p className="mb-2 text-xs font-semibold text-violet-800 dark:text-violet-300">
                Güncel revize — çizimli görseller ({task.revisionFiles.filter((f) => !f.old).length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {task.revisionFiles
                  .filter((f) => !f.old)
                  .map((f) => (
                    <FileThumb key={f.id} url={f.url} name={f.name} />
                  ))}
              </div>
            </div>
          )}
          {task.revisionFiles && task.revisionFiles.some((f) => f.old) && (
            <div className="rounded-md border border-dashed border-slate-300 p-2 opacity-70 dark:border-slate-700">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Eski revize
                </span>
                Önceki revizelerin çizimli görselleri ({task.revisionFiles.filter((f) => f.old).length})
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {task.revisionFiles
                  .filter((f) => f.old)
                  .map((f) => (
                    <FileThumb key={f.id} url={f.url} name={f.name} />
                  ))}
              </div>
            </div>
          )}

          <FileDropZone
            disabled={!canSubmitFiles}
            onFiles={canReplace ? replaceSelected : uploadSubmissions}
            className="rounded-lg"
            label={canReplace ? "Revize dosyalarını yükle ve değiştir" : "Teslim dosyalarını bırakın"}
          >
          <div className="rounded-lg border border-(--color-border) p-3">
            <p className="mb-2 text-xs font-semibold text-(--color-text-muted)">
              Teslim edilen dosyalar {task.submissions.length > 0 && `(${task.submissions.length})`}
            </p>

            {task.submissions.length === 0 && (
              <p className="mb-2 text-xs italic text-(--color-text-muted)">
                {role === "employee" ? "Henüz dosya yüklemedin." : canUpload ? "Henüz teslim dosyası yok." : "Çalışan henüz dosya yüklemedi."}
              </p>
            )}

            {orderedSubs.length > 0 &&
              (canRemoveSub && orderedSubs.length > 1 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
                  <SortableContext items={orderedSubs.map((x) => x.id)} strategy={rectSortingStrategy}>
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {orderedSubs.map((x, i) => (
                        <SortableThumb
                          key={x.id}
                          id={x.id}
                          index={i}
                          url={x.fileUrl as string}
                          name={x.fileName}
                          selectOrder={toggleable(x.fileName) ? orderOf(x.fileUrl as string) : undefined}
                          onToggle={toggleable(x.fileName) ? () => toggleSelect(x.fileUrl as string) : undefined}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {orderedSubs.map((x) => (
                    <FileThumb
                      key={x.id}
                      url={x.fileUrl as string}
                      name={x.fileName}
                      selectOrder={toggleable(x.fileName) ? orderOf(x.fileUrl as string) : undefined}
                      onToggle={toggleable(x.fileName) ? () => toggleSelect(x.fileUrl as string) : undefined}
                    />
                  ))}
                </div>
              ))}
            {canRemoveSub && orderedSubs.length > 1 && (
              <p className="mb-2 text-[11px] text-(--color-text-muted)">
                Sırayı değiştirmek için görselin üstündeki &quot;Kapak / sıra&quot; tutamacından tutup sürükleyin. İlk sıradaki kapaktır.
              </p>
            )}

            {selectableUrls.length > 0 && (canRemoveSub || sendable.length > 0) && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-(--color-surface-muted) p-2 text-xs">
                <span className="text-(--color-text-muted)">
                  {selected.length > 0
                    ? `${selected.length} dosya seçili${canSendToCalendar ? " (gönderirken kaydırma sırası seçim sırasıdır)" : ""}`
                    : "Dosyaların köşesindeki daireye dokunarak seç"}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(selected.length === selectableUrls.length ? [] : selectableUrls)}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  {selected.length === selectableUrls.length ? "Seçimi temizle" : "Tümünü seç"}
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {canReplace && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500 px-3 py-1.5 font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/10">
                      <Replace size={13} />
                      {uploadPending ? "Yükleniyor..." : "Revize dosyalarını yükle ve değiştir"}
                      <input
                        ref={replaceInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        disabled={uploadPending}
                        onChange={(e) => replaceSelected(Array.from(e.target.files ?? []))}
                      />
                    </label>
                  )}
                  {canRemoveSub && selected.length > 0 && (
                    confirmRemoveSel ? (
                      <>
                        <span className="text-(--color-text-muted)">{selected.length} dosya silinsin mi?</span>
                        <button
                          type="button"
                          disabled={removing}
                          onClick={removeSelectedSubs}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                        >
                          {removing ? "Siliniyor..." : "Evet, sil"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveSel(false)}
                          className="rounded-lg px-2 py-1.5 font-medium text-(--color-text-muted) hover:bg-(--color-surface)"
                        >
                          Vazgeç
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveSel(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/10"
                      >
                        <Trash2 size={13} />
                        Seçilenleri sil
                      </button>
                    )
                  )}
                  {canSendToCalendar && (<>
                  {/* İçerik listesinden gelen iş takvime değil, onaylanınca kendi içerik satırına gider. */}
                  {!task.fromContent && (
                  <button
                    type="button"
                    disabled={selectedSendable.length === 0}
                    onClick={() => setSendOpen("calendar")}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <CalendarPlus size={13} />
                    Paylaşım takvimine gönder
                  </button>
                  )}
                  {clientName && (
                    <button
                      type="button"
                      disabled={selectedSendable.length === 0}
                      onClick={() => setSendOpen("content")}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-600 px-3 py-1.5 font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-900/10"
                    >
                      <ListChecks size={13} />
                      İçerik listesine gönder
                    </button>
                  )}
                  {task.requestSendable && (
                    <button
                      type="button"
                      disabled={selectedSendable.length === 0}
                      onClick={() => setSendOpen("request")}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-600 px-3 py-1.5 font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-900/10"
                    >
                      <MessageSquareReply size={13} />
                      Müşteri talebine gönder
                    </button>
                  )}
                  </>)}
                </div>
              </div>
            )}

            {canReplace && (
              <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-900/10 dark:text-amber-300">
                {selectedSubs.length} dosya işaretli: revize edilmiş dosyaları bu kutuya sürükleyip bırakırsan işaretli dosyaların
                yerine geçer (aynı adlı dosya aynı dosyanın, diğerleri ad sırasıyla işaretlilerin yerine konur). Sıra korunur.
              </p>
            )}
            {replaceMsg && (
              <p className="mb-2 rounded-lg bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/10 dark:text-emerald-300">
                {replaceMsg}
              </p>
            )}

            {task.submissions.some((x) => !(x.fileUrl && isDriveUrl(x.fileUrl))) && (
              <ul className="mb-2 space-y-1.5">
                {task.submissions
                  .filter((x) => !(x.fileUrl && isDriveUrl(x.fileUrl)))
                  .map((x) => (
                    <li key={x.id} className="flex items-center gap-1.5 text-xs">
                      {x.fileUrl ? (
                        role === "employee" ? (
                          <span className="flex items-center gap-1.5 text-(--color-text)">
                            <Paperclip size={13} />
                            {x.fileName}
                          </span>
                        ) : (
                          <a
                            href={x.fileUrl}
                            className="flex items-center gap-1.5 font-medium text-brand-600 hover:underline"
                          >
                            <Download size={13} />
                            {x.fileName}
                          </a>
                        )
                      ) : (
                        <span className="text-(--color-text-muted)">
                          {x.fileName} —{" "}
                          {x.downloadedAt
                            ? role === "employee"
                              ? "karşı taraf indirdi, sunucudan kaldırıldı."
                              : "indirildi, sunucudan kaldırıldı."
                            : "süresi doldu, sunucudan kaldırıldı."}
                        </span>
                      )}
                      {canRemoveSub && x.fileUrl && (
                        <button
                          type="button"
                          disabled={removing}
                          onClick={() => {
                            if (window.confirm(`"${x.fileName}" silinsin mi?`)) runRemove(() => deleteSubmissionFiles(task.id, [x.id]));
                          }}
                          aria-label={`${x.fileName} dosyasını sil`}
                          title="Bu dosyayı sil"
                          className="ml-auto rounded p-1 text-(--color-text-muted) hover:text-brand-600 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            {canSubmitFiles && (
              <>
                <UploadBar progress={subUp.progress} label="Teslim dosyaları yükleniyor" className="mb-2" />
                <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                  <Upload size={13} />
                  {uploadPending
                    ? "Yükleniyor..."
                    : task.submissions.length > 0
                      ? "Dosya Ekle"
                      : "Dosya Yükle"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploadPending}
                    onChange={handleFileChange}
                  />
                </label>
                {uploadError && (
                  <p className="mt-2 text-xs text-brand-600">{uploadError}</p>
                )}
              </>
            )}
          </div>
          </FileDropZone>

        </div>

        {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}
        {removeError && <p className="mt-3 text-xs text-brand-600">{removeError}</p>}

        {showStatusActions && canWork && (task.status === "TODO" || task.status === "IN_PROGRESS") && (
          <div className="mt-5 flex justify-end">
            {task.status === "TODO" ? (
              <button
                type="button"
                onClick={() => handleStatus("IN_PROGRESS")}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <Play size={14} />
                {pending ? "Kaydediliyor..." : "Çalışmaya başla"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleStatus("PENDING_APPROVAL")}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <Send size={14} />
                {pending ? "Gönderiliyor..." : "Tamamladım, onaya gönder"}
              </button>
            )}
          </div>
        )}

        {showStatusActions && canWork && task.status === "PENDING_APPROVAL" && (
          <p className="mt-4 rounded-lg bg-violet-50 p-3 text-xs text-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
            Onaya gönderildi; yetkili kişi inceleyip onaylayacak veya revize isteyecek.
          </p>
        )}

        {canDeleteJob && !editing && (
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-(--color-border) pt-3">
            {confirmingDelete ? (
              <>
                <span className="text-[11px] text-(--color-text-muted)">
                  Bu iş kalıcı olarak silinsin mi?
                </span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="rounded px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                >
                  {pending ? "Siliniyor..." : "Evet, sil"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded px-2 py-1 text-[11px] font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                >
                  Vazgeç
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded px-2 py-1 text-[11px] font-medium text-(--color-text-muted) hover:text-brand-600"
              >
                İşi sil
              </button>
            )}
          </div>
        )}

        {task.status !== "TODO" && (role === "admin" || canManage || canWork) && (
          <div className="mt-5 space-y-1.5 rounded-xl border border-(--color-border) p-3">
            <div className="flex items-center justify-between">
              <label htmlFor={`caption-${task.id}`} className="text-xs font-semibold uppercase text-(--color-text-muted)">
                Caption (paylaşım metni)
              </label>
              <span className="text-[10px] text-(--color-text-muted)">{caption.length}/2200 · isteğe bağlı</span>
            </div>
            <textarea
              id={`caption-${task.id}`}
              rows={3}
              maxLength={2200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={saveCaption}
              placeholder="Paylaşımda kullanılacak metin. İçerik listesine teslimle birlikte gider; boş da bırakabilirsiniz."
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            {captionMsg && <p className="text-[11px] text-(--color-text-muted)">{captionMsg}</p>}
          </div>
        )}

        {canReviseLater && (
          <div className="mt-5 flex items-center justify-end gap-3">
            <p className="text-[11px] text-(--color-text-muted)">İşte hata varsa müşteriye gitmeden revize ver.</p>
            <button
              type="button"
              onClick={openRevise}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:text-amber-300 dark:hover:bg-amber-900/10"
            >
              <RotateCcw size={14} />
              Revize ver
            </button>
          </div>
        )}

        {canReview && task.fromContent && (
          <p className="mt-5 text-right text-[11px] text-(--color-text-muted)">
            Onaylayınca teslim görselleri ve caption bu işin içerik satırına gider; müşteriye içerik listesinden &quot;Müşteriye gönder&quot; ile açarsınız.
          </p>
        )}
        {canReview && (
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={openRevise}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-4 py-2 text-sm font-semibold text-(--color-text) hover:bg-(--color-surface-muted) disabled:opacity-60"
            >
              <RotateCcw size={14} />
              Revize
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-status-done px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
            >
              <CheckCircle2 size={14} />
              Onayla
            </button>
          </div>
        )}
      </div>

      {sendOpen === "calendar" && (
        <SendToCalendarDialog
          source={{ kind: "task", taskId: task.id }}
          files={selectedSendable.map((url) => ({ url, name: sendable.find((f) => f.url === url)?.name ?? "Görsel" }))}
          onClose={() => setSendOpen(null)}
        />
      )}
      {sendOpen === "content" && (
        <SendToContentDialog
          taskId={task.id}
          files={selectedSendable.map((url) => ({ url, name: sendable.find((f) => f.url === url)?.name ?? "Görsel" }))}
          onClose={() => setSendOpen(null)}
        />
      )}
      {sendOpen === "request" && (
        <SendToRequestDialog
          taskId={task.id}
          files={selectedSendable.map((url) => ({ url, name: sendable.find((f) => f.url === url)?.name ?? "Görsel" }))}
          onClose={() => setSendOpen(null)}
        />
      )}

      <dialog
        ref={reviseDialogRef}
        className="w-full max-w-sm rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/60"
      >
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">Yönetici revizesi</h3>
            <button
              type="button"
              onClick={() => reviseDialogRef.current?.close()}
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mb-2 text-[11px] text-(--color-text-muted)">
            Not çalışana gider ve iş yeniden Devam ediyor olur. Müşteriye gönderilmiş ama müşterinin henüz yanıtlamadığı teslim geri çekilir.
          </p>
          <textarea
            autoFocus
            rows={4}
            value={reviseNote}
            onChange={(e) => setReviseNote(e.target.value)}
            placeholder="Nelerin düzeltilmesi gerektiğini yaz..."
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          {error && <p className="mt-2 text-xs text-brand-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => reviseDialogRef.current?.close()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleRevise}
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Gönderiliyor..." : "Revizeyi ver"}
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={annotRef}
        onClose={() => setAnnotating(false)}
        data-confirm-close=""
        className="m-auto w-[calc(100%-1.5rem)] max-w-3xl rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/60"
      >
        {annotating && (
          <RevisionEditor
            title={task.title}
            subtitle={clientName ?? undefined}
            images={sendable.map((f, i) => ({ id: `${i}-${f.url}`, url: f.url, mediaType: VIDEO_EXT.test(f.name) ? "VIDEO" : "IMAGE" }))}
            progress={revUp.progress}
            team
            submit={async (fd) => {
              await revUp.run("reviseTaskAnnotated", [task.id], fd);
              revisedRef.current = true;
            }}
            onClose={() => {
              closeAnnot();
              // Revize gönderildiyse iş kartı da kapanır (iş "Devam ediyor"a döndü); vazgeçildiyse kart açık kalır.
              if (revisedRef.current) {
                revisedRef.current = false;
                onClose();
              }
            }}
          />
        )}
      </dialog>
    </dialog>
  );
}
