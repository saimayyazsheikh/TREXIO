"use client";

import { Check, Hand, Hourglass, Link2, MessageSquarePlus, Pencil, Play, Repeat, Undo2, Unlock, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge, StatusBadge } from "@/components/features/badges";
import { GlassCard } from "@/components/features/glass-card";
import { ChecklistBox } from "@/components/features/tasks/checklist-box";
import { DueChip } from "@/components/features/tasks/due-chip";
import { PersonalSteps } from "@/components/features/tasks/personal-steps";
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
  /** Ticks or unticks every checklist step at once. */
  onTickAll?: (task: WithId<TaskDoc>, done: boolean) => void;
  /** Opens the note box for this task. */
  onNote?: (task: WithId<TaskDoc>) => void;
  /** Opens the edit form for a task the employee added for themselves. */
  onEditOwn?: (task: WithId<TaskDoc>) => void;
};

/** One task on the employee's Today screen: check it off, start it, tick its steps, flag a blocker. */
export function TaskCard({ task, viewer, status, now, today, savingSubtasks, onMove, onBlock, onToggleSubtask, onTickAll, onNote, onEditOwn }: TaskCardProps) {
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
            {task.selfCreated ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                <UserRound className="size-3.5" aria-hidden /> {viewer.role === "employee" ? "Added by you" : "Added by them"}
              </span>
            ) : null}
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
          {(task.notes?.length ?? 0) > 0 ? (
            <ul className="mt-2 space-y-1" aria-label="Notes">
              {task.notes!.slice(-2).map((n) => (
                <li key={n.id} className="border-l-2 border-border-solid pl-3 text-sm">
                  <span className="font-medium">{n.by === viewer.uid ? "You" : n.byName}</span>
                  {n.about === "step" && n.subtaskTitle ? <span className="text-muted"> on “{n.subtaskTitle}”</span> : null}
                  <span className="text-muted">: </span>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : null}
          {blocked && task.blockedReason ? <p className="mt-2 rounded-control bg-status-blocked/15 px-3 py-2 text-sm text-status-blocked">Blocked: {task.blockedReason}</p> : null}
          {inReview ? <p className="mt-2 text-sm text-muted">Sent for review. Your admin will approve it or send it back.</p> : null}


          {task.subtaskTotal > 0 ? (
            <ChecklistBox task={task} locked={done || inReview} savingSubtasks={savingSubtasks} onToggleSubtask={onToggleSubtask} onTickAll={onTickAll} />
          ) : null}
          {viewer.role === "employee" && task.assigneeIds.includes(viewer.uid) ? <PersonalSteps task={task} uid={viewer.uid} locked={done || inReview} /> : null}
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
          {task.selfCreated && onEditOwn && !done ? (
            <Tooltip label="Change or delete this task">
              <Button variant="ghost" size="sm" onClick={() => onEditOwn(task)}>
                <Pencil aria-hidden /> Edit
              </Button>
            </Tooltip>
          ) : null}
          {onNote ? (
            <Tooltip label="Leave a note for your admin">
              <Button variant="ghost" size="sm" onClick={() => onNote(task)}>
                <MessageSquarePlus aria-hidden /> Note
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
