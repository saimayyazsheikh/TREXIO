"use client";

import { useId, useState } from "react";
import { CheckCheck, ChevronDown, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

/**
 * The admin's checklist on a task: tick steps one by one, or all at once. Used on a task card and inside the Not done box.
 * `locked` freezes it (the task is finished or waiting for review).
 */
export function ChecklistBox({
  task,
  locked,
  savingSubtasks,
  onToggleSubtask,
  onTickAll,
  defaultOpen = false,
}: {
  task: WithId<TaskDoc>;
  locked: boolean;
  savingSubtasks: ReadonlySet<string>;
  onToggleSubtask: (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => void;
  /** Ticks or unticks every step in one go. */
  onTickAll?: (task: WithId<TaskDoc>, done: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  const pct = task.subtaskTotal ? Math.round((task.subtaskDone / task.subtaskTotal) * 100) : 0;
  const allDone = task.subtaskTotal > 0 && task.subtaskDone === task.subtaskTotal;
  const busy = savingSubtasks.size > 0;

  return (
    <div className="mt-3 rounded-xl border border-border-solid bg-surface-raised/40">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="num shrink-0">
          Checklist <span className="text-muted">{task.subtaskDone}/{task.subtaskTotal}</span>
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-solid" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
          <span className="block h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={listId} className="border-t border-border-solid">
          {onTickAll && !locked && task.subtaskTotal > 1 ? (
            <div className="flex justify-end px-2 pt-1.5">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onTickAll(task, !allDone)}>
                {allDone ? <Undo2 aria-hidden /> : <CheckCheck aria-hidden />} {allDone ? "Untick all" : "Tick all"}
              </Button>
            </div>
          ) : null}
          <ul className="divide-y divide-border-solid">
            {task.subtasks.map((s) => (
              <li key={s.id}>
                <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-raised", locked && "cursor-not-allowed opacity-70")}>
                  <input
                    type="checkbox"
                    className="mt-px size-[18px] shrink-0 accent-[var(--brand)]"
                    checked={s.done}
                    disabled={locked || savingSubtasks.has(s.id)}
                    onChange={(e) => onToggleSubtask(task, s.id, e.target.checked)}
                  />
                  <span className={cn("min-w-0 flex-1 text-sm leading-snug", s.done && "text-muted line-through")}>{s.title}</span>
                </label>
              </li>
            ))}
            {locked && task.status === "completed" ? <li className="px-3 py-2.5 text-sm text-muted">Undo the task to change its checklist.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
