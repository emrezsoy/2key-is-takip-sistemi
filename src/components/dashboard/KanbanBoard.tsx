"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { TaskStatus } from "@prisma/client";
import { STATUS_BAR_COLOR, STATUS_LABEL } from "@/lib/format";
import { TaskCard, TaskCardOverlay, type CardTask } from "./TaskCard";
import { updateTaskStatus } from "@/lib/actions/tasks";

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "PENDING_APPROVAL", "DONE"];

export type BoardTask = CardTask & {
  clientName: string | null;
  assigneeName: string;
};

function Column({
  status,
  role,
  tasks,
}: {
  status: TaskStatus;
  role: "admin" | "employee";
  tasks: BoardTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      data-column={status}
      className={`rounded-xl border border-(--color-border) p-3 transition-colors ${
        isOver ? "bg-brand-50 dark:bg-brand-900/10" : "bg-(--color-surface-muted)"
      }`}
    >
      <div className={`h-1 w-8 rounded-full ${STATUS_BAR_COLOR[status]} mb-3`} />
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide">
          {STATUS_LABEL[status][role]}
        </h3>
        <span className="rounded-full bg-(--color-surface) px-1.5 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
          {tasks.length}
        </span>
      </div>
      <div className="min-h-16 space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            clientName={task.clientName}
            assigneeName={task.assigneeName}
            role={role}
          />
        ))}
        {tasks.length === 0 && (
          <p className="py-6 text-center text-xs text-(--color-text-muted)">
            Görev yok
          </p>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  tasks: initialTasks,
  role,
}: {
  tasks: BoardTask[];
  role: "admin" | "employee";
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sunucu bileşeni yeniden render olup taze veri gönderdiğinde (örn. yeni
  // görev eklendiğinde) yerel state'i senkronize et. useState'in başlangıç
  // değeri sadece ilk mount'ta kullanıldığı için bu olmadan yeni görevler
  // sayfa yenilenene kadar görünmüyordu.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const newStatus = over.id as TaskStatus;
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === newStatus) return;

    const previousStatus = current.status;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    updateTaskStatus(taskId, newStatus).catch(() => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t))
      );
    });
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      id="kanban-board"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            role={role}
            tasks={tasks.filter((t) => t.status === status)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <TaskCardOverlay
            task={activeTask}
            clientName={activeTask.clientName}
            assigneeName={activeTask.assigneeName}
            role={role}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
