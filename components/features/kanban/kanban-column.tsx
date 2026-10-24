"use client";

import { useDroppable } from "@dnd-kit/core";
import { CircleCheck, CircleDashed, CircleDot, Eye, OctagonAlert, type LucideIcon } from "lucide-react";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const ICON: Record<TaskStatus, LucideIcon> = { todo: CircleDashed, in_progress: CircleDot, under_review: Eye, completed: CircleCheck, blocked: OctagonAlert };
const TONE: Record<TaskStatus, string> = {
  todo: "text-status-todo",
  in_progress: "text-status-progress",
  under_review: "text-status-review",
  completed: "text-status-done",
  blocked: "text-status-blocked",
};

/** One status column. `droppable` says whether the card being dragged may land here (drives the highlight). */
export function KanbanColumn({
  laneKey,
  status,
  count,
  droppable,
  dragging,
  children,
}: {
  laneKey: string;
  status: TaskStatus;
  count: number;
  /** Whether the card being dragged can be dropped here. `undefined` when nothing is being dragged. */
  droppable: boolean | undefined;
  dragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${laneKey}::${status}`, data: { status } });
  const Icon = ICON[status];
  const label = TASK_STATUS_LABEL[status];

  return (
    <section
      ref={setNodeRef}
      aria-label={`${label}, ${count} task${count === 1 ? "" : "s"}`}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-card border bg-surface-raised/50 p-2.5 transition-colors sm:w-auto sm:min-w-60 sm:flex-1",
        dragging && droppable === true && "border-dashed border-ring",
        dragging && droppable === false && "opacity-50",
        isOver && droppable === true && "bg-surface-raised ring-2 ring-ring",
        isOver && droppable === false && "ring-2 ring-danger",
      )}
    >
      <h3 className="mb-2.5 flex items-center gap-2 px-1.5 text-sm font-semibold">
        <Icon className={cn("size-4", TONE[status])} aria-hidden />
        {label}
        <span className="num ml-auto rounded-full bg-surface-solid px-2 py-0.5 text-xs font-semibold text-muted">{count}</span>
      </h3>
      <div className="flex min-h-24 flex-1 flex-col gap-2.5">
        {children}
        {count === 0 ? <p className="m-auto px-2 text-center text-sm text-muted">{dragging && droppable ? "Drop here" : "Nothing here"}</p> : null}
      </div>
    </section>
  );
}
