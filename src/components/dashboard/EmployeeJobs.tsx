"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Inbox, Paperclip } from "lucide-react";
import { isClientOriginLabel, formatDate, STATUS_CHIP, STATUS_LABEL, URGENCY_BAR } from "@/lib/format";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import type { CardTask } from "./TaskCard";
import { ClientApprovedBadge } from "./ClientApprovedBadge";
import { lastRevisionLabel, lastRevisionSource } from "@/lib/revisionNote";

export type EmployeeJob = CardTask & {
  clientName: string | null;
  assigneeName: string;
  /** Bu çalışan işi yapabilir mi (kendine atanmış ya da sorumlu olduğu müşterinin atanmamış işi). */
  canWork: boolean;
  /** Müşteri sorumlusu olarak başkasının teslimini inceleyebilir mi. */
  canReview: boolean;
  completedAt: Date | null;
};

function JobItem({
  job,
  muted,
  onOpen,
}: {
  job: EmployeeJob;
  muted?: boolean;
  onOpen: () => void;
}) {
  const revising = job.status === "IN_PROGRESS" && !!job.revisionNote;
  const revisionSource = lastRevisionSource(job.revisionNote);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) text-left transition-colors hover:bg-(--color-surface-muted) ${
        muted ? "opacity-75" : ""
      }`}
    >
      <span className={`w-1.5 shrink-0 ${muted ? "bg-emerald-500" : URGENCY_BAR[job.urgency]}`} />
      <span className="min-w-0 flex-1 p-3">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-brand-600">
            {job.clientName ?? "Müşterisiz"}
          </span>
          {muted ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-(--color-text-muted)">
              <CheckCircle2 size={12} className="text-emerald-600" />
              {job.completedAt ? formatDate(job.completedAt) : "Tamamlandı"}
            </span>
          ) : (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[job.status]}`}
            >
              {STATUS_LABEL[job.status].employee}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{job.title}</span>
        {job.creatorLabel && (
          <span
            className={`block text-[11px] ${
              isClientOriginLabel(job.creatorLabel) ? "font-semibold text-brand-600" : "text-(--color-text-muted)"
            }`}
          >
            {isClientOriginLabel(job.creatorLabel) ? job.creatorLabel : `Veren: ${job.creatorLabel}`}
          </span>
        )}
        {job.description && (
          <span className="mt-0.5 line-clamp-1 block text-xs text-(--color-text-muted)">
            {job.description}
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--color-text-muted)">
          {!muted && job.calculatedDeadline && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {formatDate(job.calculatedDeadline)}
            </span>
          )}
          {(job.fileUrl || (job.attachments?.length ?? 0) > 0 || job.submissions.length > 0) && <Paperclip size={11} />}
          {revising && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {revisionSource ? lastRevisionLabel(job.revisionNote) : "Revize istendi"}
            </span>
          )}
          <ClientApprovedBadge approval={job.clientApproval} />
          {!job.canWork && <span>Atanan: {job.assigneeName}</span>}
        </span>
      </span>
    </button>
  );
}

function ListColumn({
  title,
  icon,
  count,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-(--color-border) bg-(--color-surface-muted) p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="rounded-full bg-(--color-surface) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
          {count}
        </span>
      </div>
      <div className="space-y-2.5">
        {children}
        {count === 0 && (
          <p className="py-8 text-center text-xs text-(--color-text-muted)">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

export function EmployeeJobs({
  incoming,
  completed,
}: {
  incoming: EmployeeJob[];
  completed: EmployeeJob[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = [...incoming, ...completed].find((j) => j.id === openId) ?? null;

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ListColumn
          title="Gelen İşler"
          icon={<Inbox size={16} className="text-brand-600" />}
          count={incoming.length}
          emptyText="Şu an bekleyen işin yok."
        >
          {incoming.map((j) => (
            <JobItem key={j.id} job={j} onOpen={() => setOpenId(j.id)} />
          ))}
        </ListColumn>

        <ListColumn
          title="Tamamlanan İşler"
          icon={<CheckCircle2 size={16} className="text-emerald-600" />}
          count={completed.length}
          emptyText="Henüz tamamlanan iş yok."
        >
          {completed.map((j) => (
            <JobItem key={j.id} job={j} muted onOpen={() => setOpenId(j.id)} />
          ))}
        </ListColumn>
      </div>

      {active && (
        <TaskDetailsDialog
          key={active.id}
          task={active}
          clientName={active.clientName}
          assigneeName={active.assigneeName}
          role="employee"
          open
          onClose={() => setOpenId(null)}
          canReview={active.canReview}
          canWork={active.canWork}
          showStatusActions
        />
      )}
    </>
  );
}
