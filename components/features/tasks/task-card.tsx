"use client";

import { useState } from "react";
import { Check, ChevronDown, Hourglass, Paperclip, Play, Repeat, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge, StatusBadge } from "@/components/features/badges";
import { GlassCard } from "@/components/features/glass-card";
import { DueChip } from "@/components/features/tasks/due-chip";
import type { TaskStatus } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

export type TaskCardProps = {
  task: WithId<TaskDoc>;
  /** Status to show (may be optimistic). */
  status: TaskStatus;
  now: Date;
  today: string;
  /** Subtask ids being saved right now. */
  savingSubtasks: ReadonlySet<string>;
  onRequestStatus: (task: WithId<TaskDoc>, status: TaskStatus) => void;
  onToggleSubtask: (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => void;
};

/** One task on the employee's Today screen: check it off, start it, tick its steps. */
export function TaskCard({ task, status, now, today, savingSubtasks, onRequestStatus, onToggleSubtask }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const done = status === "completed";
  const inReview = status === "under_review";
  const blocked = status === "blocked";
  const checklistOpen = task.subtaskTotal - task.subtaskDone > 0;
  const gateReason = checklistOpen ? `Tick every step first (${task.subtaskDone} of ${task.subtaskTotal} done)` : null;
  const checkDisabledReason = inReview ? "Waiting for your admin to review" : blocked ? "Blocked: ask your admin to unblock it" : gateReason;
  const checklistId = `checklist-${task.id}`;
  const pct = task.subtaskTotal ? Math.round((task.subtaskDone / task.subtaskTotal) * 100) : 0;

  const check = (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-disabled={!!checkDisabledReason && !done}
      aria-label={done ? `${task.title}: completed. Press to undo` : `Mark ${task.title} as done`}
      onClick={() => {
        if (done) return onRequestStatus(task, "todo");
        if (!checkDisabledReason) onRequestStatus(task, "completed");
      }}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
        done ? "border-transparent bg-success text-background" : "border-input hover:border-ring",
        !done && checkDisabledReason && "opacity-50",
      )}
    >
      {done ? <Check className="size-5" aria-hidden /> : inReview ? <Hourglass className="size-4 text-muted" aria-hidden /> : null}
    </button>
  );

  return (
    <GlassCard className={cn("p-4 transition-opacity", done && "opacity-75")}>
      <div className="flex items-start gap-3">
        {checkDisabledReason && !done ? <Tooltip label={checkDisabledReason}>{check}</Tooltip> : check}
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
          </div>
          {task.description ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{task.description}</p> : null}
          {blocked && task.blockedReason ? <p className="mt-2 rounded-control bg-status-blocked/15 px-3 py-2 text-sm text-status-blocked">Blocked: {task.blockedReason}</p> : null}
          {inReview ? <p className="mt-2 text-sm text-muted">Sent for review. Your admin will approve it or send it back.</p> : null}

          {task.attachments.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {task.attachments.map((a) => (
                <li key={a.url}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-solid px-3 text-sm text-brand-text hover:bg-surface-raised">
                    <Paperclip className="size-3.5" aria-hidden /> {a.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

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
                  <span className="block h-full rounded-full bg-brand-gradient transition-[width] duration-200" style={{ width: `${pct}%` }} />
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
                            className="size-5 accent-[var(--brand-from)]"
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

        <div className="shrink-0">
          {status === "todo" ? (
            <Tooltip label="Mark as in progress">
              <Button variant="secondary" size="sm" onClick={() => onRequestStatus(task, "in_progress")}>
                <Play aria-hidden /> Start
              </Button>
            </Tooltip>
          ) : null}
          {done ? (
            <Tooltip label="Put it back on your list">
              <Button variant="ghost" size="sm" onClick={() => onRequestStatus(task, "todo")}>
                <Undo2 aria-hidden /> Undo
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
