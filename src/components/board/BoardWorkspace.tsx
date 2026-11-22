"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { assignTask } from "@/lib/actions/clientJobs";
import { saveClientOrder } from "@/lib/actions/boardOrder";
import { URGENCY_BAR, URGENCY_CHIP, URGENCY_LABEL } from "@/lib/format";
import { ClientCard } from "./ClientCard";
import { EmployeePanel } from "./EmployeePanel";
import { NewJobDialog } from "./NewJobDialog";
import { useMediaQuery } from "./useMediaQuery";
import type { Assignee, BoardClient, Viewer } from "./types";

type DragPreview = { text: string; urgency: string };
type Toast = { kind: "ok" | "error"; text: string };

export function BoardWorkspace({
  clients,
  assignees,
  viewer,
}: {
  clients: BoardClient[];
  assignees: Assignee[];
  viewer: Viewer;
}) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [newJobFor, setNewJobFor] = useState<{ id: string; name: string } | null>(null);
  // Kutuların sırası: sürükleyince hemen yansır, arka planda kişiye özel kaydedilir.
  const [order, setOrder] = useState<string[]>(() => clients.flatMap((c) => (c.id ? [c.id] : [])));
  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sürükle-bırak sadece sağdaki çalışan paneli görünürken (geniş ekran) açık;
  // dar ekranlarda her işteki "Kişiye ata" listesi kullanılır.
  const dragEnabled = useMediaQuery("(min-width: 1280px)");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const showToast = useCallback((kind: Toast["kind"], text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, text });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const findJob = (taskId: string) =>
    clients.flatMap((c) => c.jobs).find((j) => j.id === taskId);

  const runAssign = (taskId: string, assigneeId: string | null) => {
    const job = findJob(taskId);
    if (job && job.assignedToId === assigneeId) return;
    const name = assignees.find((a) => a.id === assigneeId)?.name;

    startTransition(async () => {
      try {
        await assignTask(taskId, assigneeId);
        showToast("ok", assigneeId ? `İş ${name} kişisine atandı` : "Atama kaldırıldı");
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "İş atanamadı.");
      }
    });
  };

  // Sunucudan gelen listeye göre sıralı gösterim; sırada olmayan (yeni) müşteriler sona eklenir.
  const byId = new Map(clients.map((c) => [c.id, c] as const));
  const orderedIds = [
    ...order.filter((id) => byId.has(id)),
    ...clients.flatMap((c) => (c.id && !order.includes(c.id) ? [c.id] : [])),
  ];
  const orderedClients: BoardClient[] = [
    ...orderedIds.map((id) => byId.get(id)!),
    ...clients.filter((c) => c.id === null),
  ];
  const sortableIds = orderedIds.map((id) => `card:${id}`);

  // Kutu sürüklerken sadece kutular arasında en yakın olan, iş sürüklerken çalışan paneliyle kesişen hedef seçilir.
  const collisionDetection: CollisionDetection = (args) =>
    String(args.active.id).startsWith("card:")
      ? closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith("card:")),
        })
      : rectIntersection(args);

  const handleDragStart = (event: DragStartEvent) => {
    if (String(event.active.id).startsWith("card:")) return;
    const data = event.active.data.current as DragPreview | undefined;
    if (data) setPreview(data);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setPreview(null);
    const activeId = String(event.active.id);
    if (activeId.startsWith("card:")) {
      const overId = event.over ? String(event.over.id) : "";
      if (!overId.startsWith("card:") || overId === activeId) return;
      const from = sortableIds.indexOf(activeId);
      const to = sortableIds.indexOf(overId);
      if (from < 0 || to < 0) return;
      const next = arrayMove(orderedIds, from, to);
      setOrder(next);
      startTransition(async () => {
        try {
          await saveClientOrder(next);
        } catch (e) {
          showToast("error", e instanceof Error ? e.message : "Sıralama kaydedilemedi.");
        }
      });
      return;
    }
    const overId = event.over ? String(event.over.id) : "";
    if (!overId.startsWith("emp:")) return;
    runAssign(String(event.active.id), overId.slice(4));
  };

  return (
    <>
      <DndContext
        id="client-board"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setPreview(null)}
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
              {orderedClients.map((client) => (
                <ClientCard
                  key={client.id ?? "no-client"}
                  client={client}
                  assignees={assignees}
                  viewer={viewer}
                  dragEnabled={dragEnabled}
                  onAssign={runAssign}
                  onAdd={setNewJobFor}
                />
              ))}
            </SortableContext>
            {clients.length === 0 && (
              <p className="col-span-full rounded-xl border border-dashed border-(--color-border) p-8 text-center text-sm text-(--color-text-muted)">
                Henüz müşteri yok. Müşteriler sayfasından müşteri ekleyince burada kartları görünecek.
              </p>
            )}
          </div>

          <EmployeePanel assignees={assignees} viewer={viewer} dragging={preview !== null} />
        </div>

        <DragOverlay dropAnimation={null}>
          {preview && (
            <div className="relative w-64 overflow-hidden rounded-lg border border-brand-500 bg-(--color-surface) py-2 pl-3.5 pr-2 shadow-xl">
              <span className={`absolute inset-y-0 left-0 w-1 ${URGENCY_BAR[preview.urgency]}`} />
              <div className="flex items-start gap-1.5">
                <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug">
                  {preview.text}
                </p>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${URGENCY_CHIP[preview.urgency]}`}
                >
                  {URGENCY_LABEL[preview.urgency]}
                </span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <NewJobDialog target={newJobFor} onClose={() => setNewJobFor(null)} />

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-600" : "bg-brand-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}
