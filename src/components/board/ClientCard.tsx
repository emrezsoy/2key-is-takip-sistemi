"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FilePenLine, GripVertical, Plus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { URGENCY_RANK } from "@/lib/format";
import { JobRow } from "./JobRow";
import { MonthExportButton } from "./MonthExportButton";
import type { Assignee, BoardClient, Viewer } from "./types";

export function ClientCard({
  client,
  assignees,
  viewer,
  dragEnabled,
  onAssign,
  onAdd,
}: {
  client: BoardClient;
  assignees: Assignee[];
  viewer: Viewer;
  dragEnabled: boolean;
  onAssign: (taskId: string, assigneeId: string | null) => void;
  onAdd: (client: { id: string; name: string }) => void;
}) {
  const [showDone, setShowDone] = useState(false);

  // Kutuyu sürükleyerek yerini değiştirme (sadece başlıktaki tutamaktan; "Müşterisiz İşler" sabit kalır).
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `card:${client.id ?? "none"}`,
    disabled: !client.id,
  });

  // En acil iş en üstte; aynı aciliyette önce eklenen önce gelir.
  const active = client.jobs
    .filter((j) => j.status !== "DONE")
    .sort(
      (a, b) =>
        URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
  const done = client.jobs
    .filter((j) => j.status === "DONE")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const pendingApproval = active.filter((j) => j.status === "PENDING_APPROVAL").length;

  return (
    <section
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-2 border-(--color-border) bg-(--color-surface-muted) p-3 ${
        isDragging ? "relative z-20 opacity-90 shadow-2xl ring-2 ring-brand-500/40" : ""
      }`}
      style={{
        ...(client.color ? { borderColor: client.color } : {}),
        transform: CSS.Translate.toString(transform),
        transition: transition,
      }}
    >
      <header className="mb-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold">
            {client.id && (
              <button
                type="button"
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                aria-label="Kutuyu sürükleyerek taşı"
                title="Sürükleyerek yerini değiştir"
                className="-ml-1 shrink-0 cursor-grab touch-none rounded p-0.5 text-(--color-text-muted) hover:bg-(--color-surface) hover:text-(--color-text) active:cursor-grabbing"
              >
                <GripVertical size={15} />
              </button>
            )}
            {client.color && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
            )}
            <span className="truncate">{client.name}</span>
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {pendingApproval > 0 && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                {pendingApproval} onay bekliyor
              </span>
            )}
            <span className="rounded-full bg-(--color-surface) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
              {active.length}
            </span>
          </div>
        </div>
        {client.leads.length > 0 && (
          <p className="mt-0.5 truncate text-[11px] text-(--color-text-muted)">
            Sorumlu: {client.leads.map((l) => l.name).join(", ")}
          </p>
        )}
      </header>

      <div className="max-h-[26rem] space-y-1.5 overflow-y-auto px-1 pb-1">
        {active.length === 0 && (
          <p className="py-4 text-center text-xs text-(--color-text-muted)">
            Bekleyen iş yok
          </p>
        )}
        {active.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            clientName={client.id ? client.name : null}
            assignees={assignees}
            viewer={viewer}
            dragEnabled={dragEnabled}
            onAssign={onAssign}
          />
        ))}
      </div>

      {client.id && (viewer.canContent || client.canAdd) && (
        <div className="mx-1 mt-2 flex gap-2">
          {viewer.canContent && (
            <Link
              href={`/musteriler/${client.id}/icerik`}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs font-medium text-(--color-text-muted) transition-colors hover:border-brand-500 hover:text-brand-600"
            >
              <FilePenLine size={14} />
              İçerikler
            </Link>
          )}
          {client.canAdd && <MonthExportButton clientId={client.id} clientName={client.name} />}
        </div>
      )}

      {client.canAdd && client.id && (
        <button
          type="button"
          onClick={() => onAdd({ id: client.id!, name: client.name })}
          className="mx-1 mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs font-medium text-(--color-text-muted) transition-colors hover:border-brand-500 hover:text-brand-600"
        >
          <Plus size={14} />
          İş ekle
        </button>
      )}

      {done.length > 0 && (
        <div className="mt-2 px-1">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-(--color-text-muted) hover:text-(--color-text)"
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${showDone ? "rotate-90" : ""}`}
            />
            Tamamlananlar ({done.length})
          </button>
          {showDone && (
            <div className="mt-1.5 max-h-60 space-y-1.5 overflow-y-auto">
              {done.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  clientName={client.id ? client.name : null}
                  assignees={assignees}
                  viewer={viewer}
                  dragEnabled={false}
                  onAssign={onAssign}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
