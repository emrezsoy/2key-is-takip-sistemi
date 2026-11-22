"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import {
  isClientOriginLabel,
  STATUS_CHIP,
  STATUS_LABEL,
  URGENCY_BAR,
  URGENCY_CHIP,
  URGENCY_LABEL,
  formatDayMonth,
} from "@/lib/format";
import { joinJobText } from "@/lib/jobText";
import { completeJob } from "@/lib/actions/clientJobs";
import { TaskDetailsDialog } from "@/components/dashboard/TaskDetailsDialog";
import { ClientApprovedBadge } from "@/components/dashboard/ClientApprovedBadge";
import { lastRevisionLabel, lastRevisionSource } from "@/lib/revisionNote";
import type { Assignee, BoardJob, Viewer } from "./types";

export function JobRow({
  job,
  clientName,
  assignees,
  dragEnabled,
  onAssign,
}: {
  job: BoardJob;
  clientName: string | null;
  assignees: Assignee[];
  viewer: Viewer;
  dragEnabled: boolean;
  onAssign: (taskId: string, assigneeId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDone, setConfirmingDone] = useState(false);
  const [donePending, startDone] = useTransition();
  const text = joinJobText(job.title, job.description);

  // Sadece başlamamış / devam eden işler başkasına devredilebilir.
  const movable = job.status === "TODO" || job.status === "IN_PROGRESS";
  const draggable = dragEnabled && movable;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { text, urgency: job.urgency },
    disabled: !draggable,
  });

  // Müşteri kutusunu gören herkes (admin ya da o müşterinin sorumlusu) o müşterinin işlerini onaylayabilir.
  const canReview = true;

  // İşi kendisi hallettiyse kimseye atamadan tamamlandıya alabilir (admin ve müşteri sorumlusu).
  const canComplete = movable;

  const assigneeKnown = !job.assignedToId || assignees.some((a) => a.id === job.assignedToId);

  return (
    <div
      ref={setNodeRef}
      className={`relative overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface) ${
        isDragging ? "opacity-40" : ""
      } ${job.status === "DONE" ? "opacity-70" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${URGENCY_BAR[job.urgency]}`} />
      <div className="py-2 pl-3.5 pr-2">
        <div
          {...(draggable ? listeners : {})}
          {...(draggable ? attributes : {})}
          onClick={() => setOpen(true)}
          className={`flex items-start gap-1.5 ${
            draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          }`}
        >
          <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug">
            {text}
          </p>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${URGENCY_CHIP[job.urgency]}`}
          >
            {URGENCY_LABEL[job.urgency]}
          </span>
        </div>

        {job.creatorLabel && (
          <p
            className={`mt-1 text-[10px] ${
              isClientOriginLabel(job.creatorLabel) ? "font-semibold text-brand-600" : "text-(--color-text-muted)"
            }`}
          >
            {isClientOriginLabel(job.creatorLabel) ? job.creatorLabel : `Veren: ${job.creatorLabel}`}
          </p>
        )}

        <ClientApprovedBadge approval={job.clientApproval} className="mt-1" />
        {job.status === "IN_PROGRESS" && lastRevisionSource(job.revisionNote) && (
          <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {lastRevisionLabel(job.revisionNote)}
          </span>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {movable ? (
            <select
              value={job.assignedToId ?? ""}
              onChange={(e) => onAssign(job.id, e.target.value || null)}
              aria-label="Kişiye ata"
              className="min-w-0 max-w-[65%] truncate rounded-md border border-(--color-border) bg-(--color-bg) px-1.5 py-0.5 text-[11px] text-(--color-text-muted) outline-none focus:border-brand-500"
            >
              <option value="">Atanmadı</option>
              {!assigneeKnown && job.assignedToId && (
                <option value={job.assignedToId} disabled>
                  {job.assigneeName}
                </option>
              )}
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-[11px] text-(--color-text-muted)">
              {job.assigneeName ?? (job.status === "DONE" ? "Yönetici tamamladı" : "Atanmadı")}
            </span>
          )}

          <div className="flex shrink-0 items-center gap-1.5">
            {canComplete &&
              (confirmingDone ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={donePending}
                    onClick={() =>
                      startDone(async () => {
                        try {
                          await completeJob(job.id);
                        } finally {
                          setConfirmingDone(false);
                        }
                      })
                    }
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                  >
                    {donePending ? "..." : "Evet"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDone(false)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                  >
                    Vazgeç
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDone(true)}
                  title="Tamamlandı olarak işaretle"
                  aria-label="Tamamlandı olarak işaretle"
                  className="flex items-center gap-1 rounded-md border border-(--color-border) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-text-muted) hover:border-emerald-500 hover:text-emerald-600"
                >
                  <Check size={11} />
                  Tamamla
                </button>
              ))}
            {job.calculatedDeadline && job.status !== "DONE" && (
              <span className="text-[10px] text-(--color-text-muted)">
                {formatDayMonth(job.calculatedDeadline)}
              </span>
            )}
            {job.status !== "TODO" && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[job.status]}`}
              >
                {STATUS_LABEL[job.status].admin}
              </span>
            )}
          </div>
        </div>
      </div>

      {open && (
        <TaskDetailsDialog
          task={job}
          clientName={clientName}
          assigneeName={job.assigneeName ?? "Atanmadı"}
          role="admin"
          open={open}
          onClose={() => setOpen(false)}
          canReview={canReview}
          canManage
          canUpload
          canSend={!!job.clientId}
        />
      )}
    </div>
  );
}
