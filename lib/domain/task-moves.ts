import type { Role, TaskStatus } from "@/lib/domain/constants";
import { canTransition, type TaskData } from "@/lib/domain/tasks";

/** The fields of a task the UI needs to decide which moves to offer (works for server and browser shapes). */
export type MoveSubject = Pick<TaskData, "status" | "requiresReview" | "assigneeIds" | "completionMode" | "subtaskTotal" | "subtaskDone" | "waitingOnIds"> & {
  completion: Record<string, { done: boolean }>;
};

export type Move = {
  /** The status the user asked for (the column they dropped on / the menu item). */
  status: TaskStatus;
  enabled: boolean;
  /** Why it's unavailable, shown in tooltips and toasts. */
  reason?: string;
  /** Where the task will actually end up (an employee finishing a review task lands in Under Review, etc.). */
  outcome: TaskStatus;
  /** "untick": withdraws your own finished part while teammates are still working (the task doesn't change column). */
  kind?: "untick";
};

const EMPLOYEE_TARGETS: TaskStatus[] = ["todo", "in_progress", "completed", "blocked"];
const ADMIN_TARGETS: TaskStatus[] = ["todo", "in_progress", "under_review", "completed", "blocked"];

/** Where a task lands when `actor` asks for `requested` (mirrors `planTransition`; the server decides for real). */
export function predictOutcome(task: MoveSubject, requested: TaskStatus, actor: { uid: string; role: Role }): TaskStatus {
  if (requested !== "completed") return requested;
  if (actor.role === "admin") return "completed";
  const done = task.assigneeIds.filter((uid) => task.completion[uid]?.done || uid === actor.uid).length;
  const satisfied = task.completionMode === "any" ? done >= 1 : done === task.assigneeIds.length;
  if (!satisfied) return "in_progress";
  return task.requiresReview ? "under_review" : "completed";
}

/** Every move to offer for a task, with the reason when one is unavailable. Used by drag-and-drop and the Move menu. */
export function availableMoves(task: MoveSubject, actor: { uid: string; role: Role }): Move[] {
  const isAdmin = actor.role === "admin";
  if (!isAdmin && task.status === "under_review") return [];

  const targets = isAdmin ? ADMIN_TARGETS : EMPLOYEE_TARGETS;
  const moves: Move[] = [];
  if (!isAdmin && task.status === "in_progress" && task.completion[actor.uid]?.done) {
    moves.push({ status: "in_progress", enabled: true, outcome: "in_progress", kind: "untick" });
  }
  for (const status of targets) {
    if (status === task.status) continue;
    if (!canTransition(task.status, status)) continue;

    let reason: string | undefined;
    const finishing = status === "completed" || status === "under_review";
    if (finishing && task.subtaskDone < task.subtaskTotal) reason = `Tick every step first (${task.subtaskDone} of ${task.subtaskTotal} done)`;
    else if ((finishing || (status === "in_progress" && (task.status === "todo" || task.status === "blocked"))) && task.waitingOnIds.length > 0) {
      reason = "Waiting on another task to finish first";
    } else if (status === "completed" && !isAdmin && task.completion[actor.uid]?.done) {
      reason = "You've finished your part. Waiting for the others";
    }
    moves.push({ status, enabled: !reason, reason, outcome: predictOutcome(task, status, actor) });
  }
  return moves;
}
