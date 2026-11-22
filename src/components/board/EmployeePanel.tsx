"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Assignee, Viewer } from "./types";

function DropTarget({
  assignee,
  isSelf,
  dragging,
}: {
  assignee: Assignee;
  isSelf: boolean;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `emp:${assignee.id}` });

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
        isOver
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30 dark:bg-brand-900/20"
          : dragging
            ? "border-dashed border-brand-300 bg-(--color-surface)"
            : "border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-700 dark:bg-ink-700 dark:text-ink-100">
        {assignee.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {assignee.name}
          {isSelf && <span className="text-(--color-text-muted)"> (sen)</span>}
        </p>
        <p className="truncate text-[11px] text-(--color-text-muted)">{assignee.roleLabel}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          assignee.activeCount === 0
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-(--color-surface-muted) text-(--color-text-muted)"
        }`}
        title="Üzerindeki aktif iş sayısı"
      >
        {assignee.activeCount === 0 ? "Boşta" : `${assignee.activeCount} iş`}
      </span>
    </li>
  );
}

export function EmployeePanel({
  assignees,
  viewer,
  dragging,
}: {
  assignees: Assignee[];
  viewer: Viewer;
  dragging: boolean;
}) {
  return (
    <aside className="hidden self-start rounded-xl border border-(--color-border) bg-(--color-surface-muted) p-3 xl:sticky xl:top-4 xl:block">
      <h3 className="px-1 text-sm font-bold">Çalışanlar</h3>
      <p className="mb-3 px-1 text-[11px] text-(--color-text-muted)">
        İşi tutup bir kişinin üzerine bırak
      </p>
      <ul className="max-h-[calc(100vh-10rem)] space-y-1.5 overflow-y-auto">
        {assignees.map((a) => (
          <DropTarget
            key={a.id}
            assignee={a}
            isSelf={a.id === viewer.id}
            dragging={dragging}
          />
        ))}
        {assignees.length === 0 && (
          <li className="py-4 text-center text-xs text-(--color-text-muted)">
            Aktif çalışan yok
          </li>
        )}
      </ul>
    </aside>
  );
}
