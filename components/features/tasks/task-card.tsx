"use client";

import { useState } from "react";
import { Check, ChevronDown, Hand, Hourglass, Link2, Play, Repeat, Undo2, Unlock, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge, StatusBadge } from "@/components/features/badges";
import { GlassCard } from "@/components/features/glass-card";
import { DueChip } from "@/components/features/tasks/due-chip";
import type { Role, TaskStatus } from "@/lib/domain/constants";
import { availableMoves } from "@/lib/domain/task-moves";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

export type TaskCardProps = {
  task: WithId<TaskDoc>;
  viewer: { uid: string; role: Role };
  /** Status to show (may be optimistic). */
  status: TaskStatus;
  now: Date;
  today: string;
  /** Subtask ids being saved right now. */
  savingSubtasks: ReadonlySet<string>;
  onMove: (task: WithId<TaskDoc>, status: TaskStatus, opts?: { kind?: "untick" }) => void;
  onBlock: (task: WithId<TaskDoc>) => void;
  onToggleSubtask: (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => void;
};

/** One task on the employee's Today screen: check it off, start it, tick its steps, flag a blocker. */
export function TaskCard({ task, viewer, status, now, today, savingSubtasks, onMove, onBlock, onToggleSubtask }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const shared = task.assigneeIds.length > 1;
  const done = status === "completed";
  const inReview = status === "under_review";
  const blocked = status === "blocked";
  const myPartDone = !done && !!task.completion[viewer.uid]?.done;
  const checked = done || myPartDone;

  const moves = availableMoves({ ...task, status }, viewer);
  const finish = moves.find((m) => m.status === "completed");
  const start = moves.find((m) => m.status === "in_progress" && m.kind !== "untick");
  const canBlock = moves.some((m) => m.status === "blocked" && m.enabled);
  const unblock = blocked ? (moves.find((m) => m.status === "in_progress") ?? moves.find((m) => m.status === "todo")) : undefined;

  const checkDisabledReason = checked ? null : inReview ? "Waiting for your admin to review" : blocked ? "Blocked: unblock it first" : (finish?.reason ?? null);
  const waiting = task.waitingOnIds.map((id) => task.linkTitles[id] ?? "another task");
  const pct = task.subtaskTotal ? Math.round((task.subtaskDone / task.subtaskTotal) * 100) : 0;
  const checklistId = `checklist-${task.id}`;
  const others = task.assigneeIds.filter((uid) => uid !== viewer.uid);

  const check = (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={!!checkDisabledReason}
      aria-label={done ? `${task.title}: completed. Press to undo` : myPartDone ? `${task.title}: you finished your part. Press to take it back` : `Mark ${task.title} as done`}
      onClick={() => {
        if (done) return onMove(task, shared ? "in_progress" : "todo");
        if (myPartDone) return onMove(task, "in_progress", { kind: "untick" });
        // Tooltips don't exist on touch screens, so a click on a locked circle explains itself too.
        if (checkDisabledReason) toast.info(checkDisabledReason);
        else onMove(task, "completed");
      }}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
        checked ? "border-transparent bg-success text-background" : "border-input hover:border-ring",
        !!checkDisabledReason && "opacity-50",
      )}
    >
      {checked ? <Check className="size-5" aria-hidden /> : inReview ? <Hourglass className="size-4 text-muted" aria-hidden /> : null}
    </button>
  );

  return (
    <GlassCard className={cn("p-4 transition-opacity", done && "opacity-75")}>
      <div className="flex items-start gap-3">
        {checkDisabledReason ? <Tooltip label={checkDisabledReason}>{check}</Tooltip> : check}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn("font-semibold leading-snug", done && "line-through decoration-muted")}>{task.title}</h3>
            {task.kind === "daily" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                <Repeat className="size-3.5" aria-hidden /> Daily
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            {status !== "todo" ? <StatusBadge status={status} /> : null}
            <DueChip task={task} status={status} now={now} today={today} />
            {myPartDone ? <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">Your part is done</span> : null}
            {waiting.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
                <Link2 className="size-3.5" aria-hidden /> Waiting on: {waiting.join(", ")}
              </span>
            ) : null}
          </div>

          {shared ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <Users className="size-4" aria-hidden />
              <span>With</span>
              {others.map((uid) => (
                <span key={uid} className="inline-flex items-center gap-1 font-medium text-foreground">
                  {task.assigneeNames[uid] ?? "Teammate"}
                  {task.completion[uid]?.done ? <Check className="size-3.5 text-success" aria-label="finished their part" /> : null}
                </span>
              ))}
              <span>· {task.completionMode === "all" ? "everyone needs to finish" : "the first to finish completes it"}</span>
            </p>
          ) : null}

          {task.description ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{task.description}</p> : null}
          {blocked && task.blockedReason ? <p className="mt-2 rounded-control bg-status-blocked/15 px-3 py-2 text-sm text-status-blocked">Blocked: {task.blockedReason}</p> : null}
          {inReview ? <p className="mt-2 text-sm text-muted">Sent for review. Your admin will approve it or send it back.</p> : null}


          {task.subtaskTotal > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={checklistId}
                onClick={() => setOpen((o) => !o)}
                className="flex min-h-11 w-full items-center gap-3 rounded-control text-left text-sm font-medium hover:bg-surface-raised"
              >
                <span className="num shrink-0">
                  Checklist {task.subtaskDone}/{task.subtaskTotal}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
                  <span className="block h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
              </button>
              {open ? (
                <ul id={checklistId} className="mt-1 space-y-1">
                  {task.subtasks.map((s) => {
                    const locked = done || inReview;
                    return (
                      <li key={s.id}>
                        <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-surface-raised", locked && "cursor-not-allowed opacity-70")}>
                          <input
                            type="checkbox"
                            className="size-5 accent-[var(--brand)]"
                            checked={s.done}
                            disabled={locked || savingSubtasks.has(s.id)}
                            onChange={(e) => onToggleSubtask(task, s.id, e.target.checked)}
                          />
                          <span className={cn("text-sm", s.done && "text-muted line-through")}>{s.title}</span>
                        </label>
                      </li>
                    );
                  })}
                  {done ? <li className="px-1 text-sm text-muted">Undo the task to change its checklist.</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {status === "todo" && start ? (
            <Tooltip label={start.enabled ? "Mark as in progress" : (start.reason ?? "Not available yet")}>
              <Button variant="secondary" size="sm" aria-disabled={!start.enabled} className={cn(!start.enabled && "opacity-60")} onClick={() => onMove(task, "in_progress")}>
                <Play aria-hidden /> Start
              </Button>
            </Tooltip>
          ) : null}
          {done ? (
            <Tooltip label="Put it back on your list">
              <Button variant="ghost" size="sm" onClick={() => onMove(task, shared ? "in_progress" : "todo")}>
                <Undo2 aria-hidden /> Undo
              </Button>
            </Tooltip>
          ) : null}
          {canBlock ? (
            <Tooltip label="Tell us what's stopping you">
              <Button variant="ghost" size="sm" onClick={() => onBlock(task)}>
                <Hand aria-hidden /> I&apos;m blocked
              </Button>
            </Tooltip>
          ) : null}
          {blocked && unblock ? (
            <Tooltip label={unblock.enabled ? "The blocker is gone" : (unblock.reason ?? "Not available yet")}>
              <Button variant="secondary" size="sm" aria-disabled={!unblock.enabled} className={cn(!unblock.enabled && "opacity-60")} onClick={() => onMove(task, unblock.status)}>
                <Unlock aria-hidden /> Unblock
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
