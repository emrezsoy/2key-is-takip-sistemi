"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, MoreVertical, Paperclip } from "lucide-react";
import type { Task } from "@prisma/client";
import { isClientOriginLabel, formatDate, URGENCY_LABEL, URGENCY_STYLE } from "@/lib/format";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { ClientApprovedBadge } from "./ClientApprovedBadge";
import { lastRevisionLabel } from "@/lib/revisionNote";

export type SubmissionFile = {
  id: string;
  fileUrl: string | null;
  fileName: string;
  downloadedAt: Date | null;
};

export type CardTask = Pick<
  Task,
  | "id"
  | "title"
  | "description"
  | "urgency"
  | "difficulty"
  | "calculatedDeadline"
  | "status"
  | "fileUrl"
  | "fileName"
  | "revisionNote"
> & {
  submissions: SubmissionFile[];
  /** İşi veren: kişi adı ya da "Müşteri talebi". */
  creatorLabel?: string | null;
  /** Müşteri talebinden gelen referans görsel/videolar. */
  requestFiles?: { id: string; url: string; name: string }[];
  /** Referans dosyaların ait olduğu müşteri talebi (dosya silme için). */
  requestId?: string;
  /** İşi verenin eklediği referans dosyalar (paylaşım takvimine gönderilmez). */
  attachments?: { id: string; url: string; name: string }[];
  /** Müşteri bu işin teslimini onayladıysa (paylaşım takvimine eklenebilir). */
  clientApproval?: { at: Date | null; by: string | null } | null;
  /** Müşterinin revize isteğinde eklediği çizimli / yeni dosyalar. */
  /** old = önceki bir revizenin dosyası ("eski revize"). */
  revisionFiles?: { id: string; url: string; name: string; old?: boolean }[];
  /** İş bir müşteri talebinden (ya da bir talebin revizesinden) geldi: teslim "Müşteri talebine gönder" ile iletilebilir. */
  requestSendable?: boolean;
};

type CardProps = {
  task: CardTask;
  clientName: string | null;
  assigneeName: string;
  role: "admin" | "employee";
};

function TaskCardView({
  task,
  clientName,
  assigneeName,
  role,
  expanded,
  onToggleExpand,
  onOpenDetails,
  dragHandleProps,
  isDragging,
}: CardProps & {
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}) {
  const initial = assigneeName.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`rounded-xl border border-(--color-border) bg-(--color-surface) shadow-card ${
        isDragging ? "opacity-40" : ""
      } ${expanded ? "p-4" : "p-3"}`}
    >
      <div className="flex items-start gap-2">
        <div
          {...dragHandleProps}
          data-task-drag-handle={task.id}
          className="min-w-0 flex-1 cursor-grab touch-none active:cursor-grabbing"
        >
          <p className="truncate text-sm font-semibold leading-snug">{task.title}</p>
          <p className="mt-0.5 truncate text-xs text-(--color-text-muted)">
            {assigneeName}
          </p>
          <ClientApprovedBadge approval={task.clientApproval} className="mt-1" />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Daralt" : "Genişlet"}
            className="rounded p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronRight
              size={16}
              className={`transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={onOpenDetails}
            aria-label="Detaylar"
            className="rounded p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {clientName && (
            <p className="text-xs text-(--color-text-muted)">{clientName}</p>
          )}
          {task.creatorLabel && (
            <p className={`text-[11px] ${isClientOriginLabel(task.creatorLabel) ? "font-semibold text-brand-600" : "text-(--color-text-muted)"}`}>
              {isClientOriginLabel(task.creatorLabel) ? task.creatorLabel : `Veren: ${task.creatorLabel}`}
            </p>
          )}
          {task.status === "IN_PROGRESS" && lastRevisionLabel(task.revisionNote) && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {lastRevisionLabel(task.revisionNote)}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLE[task.urgency]}`}
            >
              {URGENCY_LABEL[task.urgency]}
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-200 text-[11px] font-semibold text-ink-700 dark:bg-ink-700 dark:text-ink-100">
              {initial}
            </span>
          </div>
          {role === "admin" && task.difficulty && (
            <p className="text-[11px] text-(--color-text-muted)">
              Zorluk: {task.difficulty}/5
            </p>
          )}
          <div className="flex items-center justify-between text-[11px] text-(--color-text-muted)">
            {task.calculatedDeadline ? (
              <span>{formatDate(task.calculatedDeadline)}</span>
            ) : (
              <span />
            )}
            {(task.fileUrl || (task.attachments?.length ?? 0) > 0) && <Paperclip size={12} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskCard(props: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: props.task.id,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCardView
        {...props}
        expanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
        onOpenDetails={() => setDetailsOpen(true)}
        dragHandleProps={{ ...listeners, ...attributes }}
        isDragging={isDragging}
      />
      <TaskDetailsDialog
        task={props.task}
        clientName={props.clientName}
        assigneeName={props.assigneeName}
        role={props.role}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  );
}

export function TaskCardOverlay(props: CardProps) {
  return (
    <TaskCardView
      {...props}
      expanded={false}
      onToggleExpand={() => {}}
      onOpenDetails={() => {}}
    />
  );
}
