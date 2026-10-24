"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CalendarCheck, Check, Link2, MessageCircleMore, MoreHorizontal, Repeat, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge } from "@/components/features/badges";
import { DueChip } from "@/components/features/tasks/due-chip";
import { NudgeDialog } from "@/components/features/tasks/nudge-dialog";
import { TASK_STATUS_LABEL, type Role, type TaskStatus } from "@/lib/domain/constants";
import { availableMoves } from "@/lib/domain/task-moves";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

export type Person = { name: string };

type Props = {
  task: WithId<TaskDoc>;
  status: TaskStatus;
  laneKey: string;
  viewer: { uid: string; role: Role };
  people: ReadonlyMap<string, Person>;
  now: Date;
  today: string;
  /** Business accent colour (CSS value), used for the business name at the top of the card. */
  accent?: string;
  /** The business the task belongs to, shown at the top of the card. */
  businessName?: string;
  onOpen: (task: WithId<TaskDoc>) => void;
  onMove: (task: WithId<TaskDoc>, status: TaskStatus, opts?: { kind?: "untick" }) => void;
};

/** The visual card, used both in the column and in the drag overlay. */
export function KanbanCardBody({ task, status, viewer, people, now, today, accent, businessName, onMove, dragging }: Omit<Props, "laneKey" | "onOpen"> & { dragging?: boolean }) {
  const moves = availableMoves({ ...task, status }, viewer);
  const done = task.assigneeIds.filter((uid) => task.completion[uid]?.done).length;
  const waiting = task.waitingOnIds.map((id) => task.linkTitles[id] ?? "another task");
  const [nudging, setNudging] = useState(false);
  const canNudge = viewer.role === "admin" && status !== "completed" && task.assigneeIds.length > 0;

  return (
    <div className={cn("glass rounded-xl p-3.5 text-left transition-shadow hover:shadow-[var(--shadow-2)]", dragging && "shadow-[var(--shadow-3)] ring-2 ring-ring")}>
      {businessName ? (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-none tracking-wider" style={accent ? { color: accent } : undefined}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          <span className="truncate">{businessName}</span>
        </p>
      ) : null}
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug">{task.title}</p>
        {task.kind === "daily" ? <Repeat className="mt-0.5 size-3.5 shrink-0 text-muted" aria-label="Daily routine" /> : null}
        {/* Keyboard- and touch-friendly alternative to dragging. */}
        <span className="flex items-start" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {canNudge ? (
            <>
              <Tooltip label="Send a WhatsApp nudge">
                <Button variant="ghost" size="icon" className="-mt-1.5 size-9" aria-label={`Send a WhatsApp nudge about “${task.title}”`} onClick={() => setNudging(true)}>
                  <MessageCircleMore aria-hidden />
                </Button>
              </Tooltip>
              <NudgeDialog task={task} open={nudging} onOpenChange={setNudging} />
            </>
          ) : null}
          <DropdownMenu>
            <Tooltip label="Move to…">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="-mr-2 -mt-1.5 size-9" aria-label={`Move “${task.title}” to another column`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {moves.length === 0 ? <p className="px-2.5 py-2 text-sm text-muted">No moves available right now.</p> : null}
              {moves.map((m) => (
                <DropdownMenuItem key={`${m.status}-${m.kind ?? ""}`} disabled={!m.enabled} onSelect={() => onMove(task, m.status, m.kind ? { kind: m.kind } : undefined)}>
                  <span className="flex flex-col">
                    <span>{m.kind === "untick" ? "Take back my part" : TASK_STATUS_LABEL[m.status]}</span>
                    {m.reason ? <span className="text-xs text-muted">{m.reason}</span> : null}
                    {m.enabled && m.outcome !== m.status ? <span className="text-xs text-muted">Goes to {TASK_STATUS_LABEL[m.outcome]}</span> : null}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <PriorityBadge priority={task.priority} />
        <DueChip task={task} status={status} now={now} today={today} />
      </div>

      {status === "blocked" && task.blockedReason ? <p className="mt-2 line-clamp-2 rounded-lg bg-status-blocked/15 px-2 py-1 text-xs text-status-blocked">Blocked: {task.blockedReason}</p> : null}
      {waiting.length > 0 ? (
        <p className="mt-2 flex items-start gap-1 text-xs text-warning">
          <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">Waiting on: {waiting.join(", ")}</span>
        </p>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border-solid pt-3">
        <ul className="flex -space-x-2" aria-label={`Assigned to ${task.assigneeIds.map((u) => people.get(u)?.name ?? task.assigneeNames[u] ?? "teammate").join(", ")}`}>
          {task.assigneeIds.slice(0, 4).map((uid) => {
            const p = people.get(uid);
            return (
              <li key={uid} className="relative rounded-full ring-2 ring-surface-solid">
                <Avatar name={p?.name ?? task.assigneeNames[uid] ?? "?"} size="sm" />
                {task.completion[uid]?.done ? <Check className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-success p-0.5 text-background" aria-label="finished their part" /> : null}
              </li>
            );
          })}
          {task.assigneeIds.length > 4 ? <li className="num flex size-7 items-center justify-center rounded-full bg-surface-raised text-[10px] font-semibold ring-2 ring-surface-solid">+{task.assigneeIds.length - 4}</li> : null}
        </ul>
        {task.assigneeIds.length > 0 ? (
          <span className="min-w-0 flex-1 basis-20 truncate text-[13px] font-medium">
            {task.assigneeIds.map((u) => people.get(u)?.name ?? task.assigneeNames[u] ?? "Teammate")[0]}
            {task.assigneeIds.length > 1 ? <span className="text-muted"> +{task.assigneeIds.length - 1}</span> : null}
          </span>
        ) : null}
        <div className="num ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          {task.assigneeIds.length > 1 ? (
            <span className="inline-flex items-center gap-1" title="Parts finished">
              <Users className="size-3.5" aria-hidden /> {done}/{task.assigneeIds.length}
            </span>
          ) : null}
          {task.subtaskTotal > 0 ? (
            <span className="inline-flex items-center gap-1" title="Checklist steps done">
              <CalendarCheck className="size-3.5" aria-hidden /> {task.subtaskDone}/{task.subtaskTotal}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function KanbanCard(props: Props) {
  const { task, laneKey, status, viewer, onOpen } = props;
  const canDrag = availableMoves({ ...task, status }, viewer).some((m) => m.enabled && m.kind !== "untick");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${laneKey}::${task.id}`, data: { task, laneKey }, disabled: !canDrag });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`${task.title}. Press Enter to open details${canDrag ? ", Space to pick up and move" : ""}`}
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(task);
        } else listeners?.onKeyDown?.(e);
      }}
      className={cn("cursor-grab rounded-control active:cursor-grabbing", !canDrag && "cursor-pointer", isDragging && "opacity-40")}
    >
      <KanbanCardBody {...props} />
    </div>
  );
}
