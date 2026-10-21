"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, ListChecks } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/features/badges";
import { GlassCard } from "@/components/features/glass-card";
import { compareTasks } from "@/lib/domain/task-sort";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

export function TaskChipCard({ task, used, dragging }: { task: WithId<TaskDoc>; used?: boolean; dragging?: boolean }) {
  return (
    <div className={cn("glass flex items-start gap-2 rounded-control p-3", dragging && "shadow-[var(--shadow-3)] ring-2 ring-ring")}>
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
          {used ? <span className="text-xs font-semibold text-success">In your journal</span> : null}
        </div>
      </div>
    </div>
  );
}

function DraggableTask({ task, used }: { task: WithId<TaskDoc>; used: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <li ref={setNodeRef} {...listeners} {...attributes} className={cn("cursor-grab touch-manipulation active:cursor-grabbing", isDragging && "opacity-40")}>
      <TaskChipCard task={task} used={used} />
    </li>
  );
}

/** Today's tasks, draggable into an hour. Each hour also has an "Add a task" menu for keyboard and touch use. */
export function TaskPanel({ tasks, usedIds, editable }: { tasks: WithId<TaskDoc>[]; usedIds: ReadonlySet<string>; editable: boolean }) {
  const sorted = [...tasks].sort((a, b) => compareTasks({ ...a, dueAtMs: a.dueAt?.toMillis() ?? null }, { ...b, dueAtMs: b.dueAt?.toMillis() ?? null }));
  return (
    <GlassCard className="p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <ListChecks className="size-5" aria-hidden /> This day&apos;s tasks
      </h2>
      <p className="mt-1 text-sm text-muted">{editable ? "Drag a task into the hour you worked on it, or use “Add a task” inside an hour." : "The tasks that belonged to this day."}</p>
      {sorted.length === 0 ? (
        <p className="mt-4 rounded-control bg-surface-raised px-3 py-4 text-center text-sm text-muted">No tasks for this day.</p>
      ) : editable ? (
        <ul className="mt-3 space-y-2" aria-label="Draggable tasks">
          {sorted.map((t) => (
            <DraggableTask key={t.id} task={t} used={usedIds.has(t.id)} />
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-2">
          {sorted.map((t) => (
            <li key={t.id}>
              <TaskChipCard task={t} used={usedIds.has(t.id)} />
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
