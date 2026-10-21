import { DomainError } from "@/lib/domain/errors";
import type { Priority, Role, TaskStatus } from "@/lib/domain/constants";
import { TASK_STATUS_LABEL } from "@/lib/domain/constants";

export type Subtask = { id: string; title: string; done: boolean; doneAt: Date | null; doneBy: string | null };
export type Attachment = { name: string; url: string; size: number; type: string };

/** A task as stored in Firestore (server view, plain `Date`s). */
export type TaskData = {
  kind: "daily" | "oneoff";
  templateId: string | null;
  /** PKT calendar day the task belongs to (`YYYY-MM-DD`). */
  date: string;
  businessId: string;
  assigneeIds: string[];
  completion: Record<string, { done: boolean; at: Date | null }>;
  completionMode: "all" | "any";
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  blockedReason: string | null;
  blockedBy: string | null;
  dueAt: Date | null;
  requiresReview: boolean;
  subtasks: Subtask[];
  subtaskTotal: number;
  subtaskDone: number;
  relatedTaskIds: string[];
  dependsOnIds: string[];
  attachments: Attachment[];
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  escalation: { l1At: Date | null; l2At: Date | null };
};

export type Actor = { uid: string; name: string; role: Role };

/** What a shared writer must persist together: the task change, an audit entry and an activity entry. */
export type TaskPlan = {
  patch: Partial<TaskData>;
  audit: { action: string; from: string | null; to: string | null; meta: Record<string, unknown> };
  activityText: string;
};

/** Effective status changes allowed by the workflow (before role rules). */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "blocked", "completed", "under_review"],
  in_progress: ["todo", "blocked", "completed", "under_review"],
  under_review: ["in_progress", "completed", "blocked"],
  completed: ["todo", "in_progress"],
  blocked: ["todo", "in_progress"],
};

export const MAX_BLOCK_REASON = 300;

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** An employee finishing a task that needs review lands in "under_review"; only the admin can reach "completed". */
export function resolveRequestedStatus(task: Pick<TaskData, "requiresReview">, requested: TaskStatus, role: Role): TaskStatus {
  return requested === "completed" && task.requiresReview && role !== "admin" ? "under_review" : requested;
}

export function countSubtasks(subtasks: Subtask[]): { total: number; done: number } {
  return { total: subtasks.length, done: subtasks.filter((s) => s.done).length };
}

function assertCanAct(task: Pick<TaskData, "assigneeIds">, actor: Actor) {
  if (actor.role !== "admin" && !task.assigneeIds.includes(actor.uid)) {
    throw new DomainError("This task isn't assigned to you.", 403);
  }
}

function verb(from: TaskStatus, to: TaskStatus): string {
  if (from === "blocked") return to === "todo" ? "unblocked and moved back to To-Do" : "unblocked and restarted";
  if (to === "completed") return from === "under_review" ? "approved" : "completed";
  if (to === "under_review") return "sent for review";
  if (to === "blocked") return "blocked";
  if (to === "in_progress") return from === "completed" ? "reopened" : from === "under_review" ? "sent back to In Progress" : "started";
  return from === "completed" ? "reopened" : "moved back to To-Do";
}

/**
 * Plans a status change. `requested` may be "completed" even for tasks that need review: an employee's
 * completion then lands in "under_review" and only an admin can approve it.
 */
export function planTransition(
  task: TaskData,
  requested: TaskStatus,
  actor: Actor,
  opts: { reason?: string; now: Date },
): TaskPlan {
  assertCanAct(task, actor);
  const from = task.status;
  if (from === "under_review" && actor.role !== "admin") {
    throw new DomainError("Only the admin can review this task.", 403);
  }

  const to = resolveRequestedStatus(task, requested, actor.role);
  if (from === to) throw new DomainError(`This task is already ${TASK_STATUS_LABEL[to]}.`, 409);
  if (!canTransition(from, to)) {
    throw new DomainError(`A ${TASK_STATUS_LABEL[from]} task can't move to ${TASK_STATUS_LABEL[to]}.`, 409);
  }

  if (to === "completed" || to === "under_review") {
    const { total, done } = countSubtasks(task.subtasks);
    if (done < total) throw new DomainError(`Finish the checklist first (${done} of ${total} done).`, 409);
  }

  let reason: string | null = null;
  if (to === "blocked") {
    reason = (opts.reason ?? "").trim();
    if (reason.length < 3) throw new DomainError("Tell us why it's blocked (a few words is enough).", 400);
    if (reason.length > MAX_BLOCK_REASON) throw new DomainError(`Keep the reason under ${MAX_BLOCK_REASON} characters.`, 400);
  }

  const completion = { ...task.completion };
  if (to === "completed") {
    for (const uid of task.assigneeIds) completion[uid] = { done: true, at: opts.now };
  } else if (from === "completed") {
    for (const uid of task.assigneeIds) completion[uid] = { done: false, at: null };
  }

  return {
    patch: {
      status: to,
      completion,
      completedAt: to === "completed" ? opts.now : null,
      blockedReason: reason,
      blockedBy: to === "blocked" ? actor.uid : null,
      updatedAt: opts.now,
    },
    audit: {
      action: "task.status",
      from,
      to,
      meta: { requested, ...(reason ? { reason } : {}), ...(from === "blocked" ? { previousReason: task.blockedReason, unblockedBy: actor.uid } : {}) },
    },
    activityText: `${actor.name} ${verb(from, to)} “${task.title}”`,
  };
}

/** Ticks or unticks one checklist item. Locked while the task is completed so history stays truthful. */
export function planSubtaskToggle(task: TaskData, subtaskId: string, done: boolean, actor: Actor, now: Date): TaskPlan {
  assertCanAct(task, actor);
  if (task.status === "completed" || task.status === "under_review") {
    throw new DomainError("Reopen the task to change its checklist.", 409);
  }
  const target = task.subtasks.find((s) => s.id === subtaskId);
  if (!target) throw new DomainError("That checklist item doesn't exist.", 404);
  if (target.done === done) throw new DomainError("That item is already in that state.", 409);

  const subtasks = task.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, done, doneAt: done ? now : null, doneBy: done ? actor.uid : null } : s,
  );
  const { total, done: doneCount } = countSubtasks(subtasks);
  return {
    patch: { subtasks, subtaskTotal: total, subtaskDone: doneCount, updatedAt: now },
    audit: { action: "task.subtask", from: String(target.done), to: String(done), meta: { subtaskId, title: target.title, progress: `${doneCount}/${total}` } },
    activityText: `${actor.name} ${done ? "ticked" : "unticked"} “${target.title}” on “${task.title}” (${doneCount}/${total})`,
  };
}

export type DueState = "none" | "done" | "overdue" | "soon" | "later";

/** Due state for UI chips. "Soon" = within 2 hours. A task with no time is overdue once its day has passed. */
export function dueState(task: Pick<TaskData, "status" | "dueAt" | "date">, now: Date, todayPkt: string): DueState {
  if (task.status === "completed") return "done";
  if (task.dueAt) {
    const ms = task.dueAt.getTime() - now.getTime();
    if (ms < 0) return "overdue";
    return ms <= 2 * 60 * 60 * 1000 ? "soon" : "later";
  }
  return task.date < todayPkt ? "overdue" : "none";
}
