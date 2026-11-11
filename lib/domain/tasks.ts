import { DomainError } from "@/lib/domain/errors";
import type { Priority, Role, TaskStatus } from "@/lib/domain/constants";
import { TASK_STATUS_LABEL } from "@/lib/domain/constants";
import { pktDateString } from "@/lib/time";

export type Subtask = { id: string; title: string; done: boolean; doneAt: Date | null; doneBy: string | null };

/** A step an employee wrote for themselves on a task. It never changes the admin's checklist or whether the task is finished. */
export type PersonalStep = { id: string; title: string; done: boolean };
export const MAX_PERSONAL_STEPS = 20;

/** A comment on a task: free-standing, or left when finishing the task or ticking one of its steps. */
export type TaskNote = { id: string; by: string; byName: string; text: string; at: Date; about: "comment" | "finish" | "step"; subtaskTitle: string | null };

/** A task as stored in Firestore (server view, plain `Date`s). */
export type TaskData = {
  kind: "daily" | "oneoff";
  templateId: string | null;
  /** PKT calendar day the task belongs to (`YYYY-MM-DD`). */
  date: string;
  businessId: string;
  assigneeIds: string[];
  /** Names copied onto the task so employees can see co-assignees without reading other profiles. */
  assigneeNames: Record<string, string>;
  /** Each assignee's own tick. A task completes when everyone ("all") or anyone ("any") has ticked. */
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
  /** Informational two-way links. */
  relatedTaskIds: string[];
  /** Prerequisites: this task can't start or finish until every one of them is completed. */
  dependsOnIds: string[];
  /** Titles of linked tasks (dependencies and related), so people who can't read them still see names. */
  linkTitles: Record<string, string>;
  /** The subset of `dependsOnIds` not completed yet. Kept in sync by the shared writer; display only. */
  waitingOnIds: string[];
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  escalation: { l1At: Date | null; l2At: Date | null };
  /** Comments from the people on the task and the admin, oldest first. */
  notes?: TaskNote[];
  /** Why a daily routine wasn't done, written by the person it was for. */
  missedReason?: string | null;
  missedReasonAt?: Date | null;
  /** Added by the employee for themselves (for example, work the admin gave them out loud). */
  selfCreated?: boolean;
  /** Each assignee's own private-to-the-task step list, keyed by user id. */
  personalSteps?: Record<string, PersonalStep[]>;
};

export type Actor = { uid: string; name: string; role: Role };

/** A prerequisite as read inside the transaction (authoritative; never trust `waitingOnIds` for rules). */
export type DependencySnapshot = { id: string; title: string; status: TaskStatus };

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

export function countSubtasks(subtasks: Subtask[]): { total: number; done: number } {
  return { total: subtasks.length, done: subtasks.filter((s) => s.done).length };
}

/** How many assignees have ticked their part, and whether the completion rule is met. */
export function completionProgress(task: Pick<TaskData, "assigneeIds" | "completion" | "completionMode">): { done: number; total: number; satisfied: boolean } {
  const done = task.assigneeIds.filter((uid) => task.completion[uid]?.done).length;
  const total = task.assigneeIds.length;
  return { done, total, satisfied: task.completionMode === "any" ? done >= 1 : done === total };
}

function assertCanAct(task: Pick<TaskData, "assigneeIds">, actor: Actor) {
  if (actor.role !== "admin" && !task.assigneeIds.includes(actor.uid)) {
    throw new DomainError("This task isn't assigned to you.", 403);
  }
}

function assertChecklistDone(task: Pick<TaskData, "subtasks">) {
  const { total, done } = countSubtasks(task.subtasks);
  if (done < total) throw new DomainError(`Finish the checklist first (${done} of ${total} done).`, 409);
}

function assertDependenciesDone(deps: DependencySnapshot[]) {
  const waiting = deps.filter((d) => d.status !== "completed");
  if (waiting.length > 0) throw new DomainError(`Waiting on: ${waiting.map((d) => d.title).join(", ")}.`, 409);
}

function verb(from: TaskStatus, to: TaskStatus): string {
  if (from === "blocked") return to === "todo" ? "unblocked and moved back to To-Do" : "unblocked and restarted";
  if (to === "completed") return from === "under_review" ? "approved" : "completed";
  if (to === "under_review") return "sent for review";
  if (to === "blocked") return "blocked";
  if (to === "in_progress") return from === "completed" ? "reopened" : from === "under_review" ? "sent back to In Progress" : "started";
  return from === "completed" ? "reopened" : "moved back to To-Do";
}

const clearCompletion = (assigneeIds: string[], keep: TaskData["completion"], only?: string): TaskData["completion"] => {
  const next = { ...keep };
  for (const uid of only ? [only] : assigneeIds) next[uid] = { done: false, at: null };
  return next;
};

/**
 * Plans a status change.
 *
 * - "completed" requested by an employee ticks THEIR part. With several assignees the task only completes once the
 *   completion rule is met; a task that needs review then lands in "under_review" and only the admin can approve.
 * - The admin completing a task completes it for everyone.
 * - Moving into In Progress / Completed / Under Review is refused while a prerequisite isn't completed.
 */
export function planTransition(
  task: TaskData,
  requested: TaskStatus,
  actor: Actor,
  opts: { reason?: string; now: Date; deps?: DependencySnapshot[] },
): TaskPlan {
  assertCanAct(task, actor);
  const from = task.status;
  const deps = opts.deps ?? [];
  const now = opts.now;
  const isAdmin = actor.role === "admin";
  if (from === "under_review" && !isAdmin) throw new DomainError("Only the admin can review this task.", 403);

  if (requested === "completed") {
    if (from === "completed") throw new DomainError(`This task is already ${TASK_STATUS_LABEL.completed}.`, 409);
    if (!canTransition(from, "completed")) throw new DomainError(`A ${TASK_STATUS_LABEL[from]} task can't move to ${TASK_STATUS_LABEL.completed}.`, 409);
    assertChecklistDone(task);
    assertDependenciesDone(deps);

    // Finishing a routine after its time passed: the person says why it was late (once), and the admin sees "late" plus that reason.
    const late = !isAdmin && isMissed({ kind: task.kind, status: from, dueAtMs: task.dueAt?.getTime() ?? null, date: task.date }, now.getTime(), pktDateString(now));
    let lateMeta: Record<string, unknown> = {};
    let lateReason: Partial<TaskData> = {};
    if (late) {
      const typed = (opts.reason ?? "").trim();
      const reason = typed || (task.missedReason ?? "").trim();
      if (reason.length < 3) throw new DomainError("Tell us why it was late (a few words is enough).", 400);
      if (reason.length > MAX_MISSED_REASON) throw new DomainError(`Keep the reason under ${MAX_MISSED_REASON} characters.`, 400);
      if (typed) lateReason = { missedReason: typed, missedReasonAt: now };
      const dueMs = task.dueAt?.getTime() ?? null;
      lateMeta = { late: true, reason, ...(dueMs !== null ? { lateBySec: Math.max(0, Math.round((now.getTime() - dueMs) / 1000)) } : {}) };
    }

    const completion = { ...task.completion };
    if (isAdmin) {
      for (const uid of task.assigneeIds) completion[uid] = { done: true, at: completion[uid]?.done ? completion[uid].at : now };
    } else {
      if (completion[actor.uid]?.done) throw new DomainError("You've already finished your part.", 409);
      completion[actor.uid] = { done: true, at: now };
    }
    const progress = completionProgress({ ...task, completion });

    if (!progress.satisfied) {
      const to: TaskStatus = "in_progress";
      return {
        patch: { status: to, completion, updatedAt: now, ...lateReason },
        audit: { action: "task.complete", from, to, meta: { progress: `${progress.done}/${progress.total}`, mode: task.completionMode, ...lateMeta } },
        activityText: `${actor.name} finished their part of “${task.title}” (${progress.done}/${progress.total})`,
      };
    }
    const to: TaskStatus = task.requiresReview && !isAdmin ? "under_review" : "completed";
    return {
      patch: { status: to, completion, completedAt: to === "completed" ? now : null, blockedReason: null, blockedBy: null, updatedAt: now, ...lateReason },
      audit: { action: "task.status", from, to, meta: { requested, ...(task.assigneeIds.length > 1 ? { progress: `${progress.done}/${progress.total}` } : {}), ...lateMeta } },
      activityText: `${actor.name} ${verb(from, to)} “${task.title}”`,
    };
  }

  const to = requested;
  // Taking back your own tick while teammates are still working: the task stays In Progress.
  if (from === "in_progress" && to === "in_progress" && !isAdmin && task.completion[actor.uid]?.done) {
    const completion = { ...task.completion, [actor.uid]: { done: false, at: null } };
    const progress = completionProgress({ ...task, completion });
    return {
      patch: { completion, updatedAt: now },
      audit: { action: "task.reopen", from, to, meta: { progress: `${progress.done}/${progress.total}` } },
      activityText: `${actor.name} took back their part of “${task.title}” (${progress.done}/${progress.total})`,
    };
  }
  if (from === to) throw new DomainError(`This task is already ${TASK_STATUS_LABEL[to]}.`, 409);
  if (!canTransition(from, to)) throw new DomainError(`A ${TASK_STATUS_LABEL[from]} task can't move to ${TASK_STATUS_LABEL[to]}.`, 409);

  if (to === "under_review") {
    assertChecklistDone(task);
    assertDependenciesDone(deps);
  }
  if (to === "in_progress" && (from === "todo" || from === "blocked")) assertDependenciesDone(deps);

  let reason: string | null = null;
  if (to === "blocked") {
    reason = (opts.reason ?? "").trim();
    if (reason.length < 3) throw new DomainError("Tell us why it's blocked (a few words is enough).", 400);
    if (reason.length > MAX_BLOCK_REASON) throw new DomainError(`Keep the reason under ${MAX_BLOCK_REASON} characters.`, 400);
  }

  // Leaving "completed" or "under_review" reopens work: an employee reopens only their own part; the admin resets everyone.
  let completion = task.completion;
  if (from === "completed" || from === "under_review") {
    completion = clearCompletion(task.assigneeIds, task.completion, isAdmin ? undefined : actor.uid);
  }

  return {
    patch: {
      status: to,
      completion,
      completedAt: null,
      blockedReason: reason,
      blockedBy: to === "blocked" ? actor.uid : null,
      updatedAt: now,
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
    audit: { action: "task.subtask", from: String(target.done), to: String(done), meta: { subtaskId, subtaskTitle: target.title, progress: `${doneCount}/${total}` } },
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

export const MAX_NOTE = 500;
export const MAX_NOTES = 60;
export const MAX_MISSED_REASON = 300;

/**
 * A daily routine counts as "not done" once its time has passed without it being finished or blocked.
 * With no time set, it counts once its day is over.
 */
export function isMissed(task: { kind: "daily" | "oneoff"; status: TaskStatus; dueAtMs: number | null; date: string }, nowMs: number, todayPkt: string): boolean {
  if (task.kind !== "daily") return false;
  if (task.status !== "todo" && task.status !== "in_progress") return false;
  return task.dueAtMs !== null ? task.dueAtMs < nowMs : task.date < todayPkt;
}

/** Adds a comment. The person it was for, or the admin, may comment at any time, even after the task is finished. */
export function planComment(
  task: TaskData,
  input: { text: string; about?: TaskNote["about"]; subtaskTitle?: string | null },
  actor: Actor,
  now: Date,
  newId: () => string,
): TaskPlan {
  assertCanAct(task, actor);
  const text = input.text.trim();
  if (text.length === 0) throw new DomainError("Write a note first.", 400);
  if (text.length > MAX_NOTE) throw new DomainError(`Keep the note under ${MAX_NOTE} characters.`, 400);
  const note: TaskNote = { id: newId(), by: actor.uid, byName: actor.name, text, at: now, about: input.about ?? "comment", subtaskTitle: input.subtaskTitle?.trim() || null };
  const notes = [...(task.notes ?? []), note].slice(-MAX_NOTES);
  return {
    patch: { notes, updatedAt: now },
    audit: { action: "task.comment", from: null, to: null, meta: { note: text, about: note.about, ...(note.subtaskTitle ? { subtaskTitle: note.subtaskTitle } : {}) } },
    activityText: `${actor.name} commented on “${task.title}”`,
  };
}

/** The person a missed routine was for says why it wasn't done. The reason is kept on the task and in the audit log. */
export function planMissedReason(task: TaskData, reasonRaw: string, actor: Actor, now: Date, todayPkt: string): TaskPlan {
  if (actor.role === "admin") throw new DomainError("Only the person it was for can say why it wasn't done.", 403);
  assertCanAct(task, actor);
  if (!isMissed({ kind: task.kind, status: task.status, dueAtMs: task.dueAt?.getTime() ?? null, date: task.date }, now.getTime(), todayPkt)) {
    throw new DomainError("This routine isn't marked as not done.", 409);
  }
  const reason = reasonRaw.trim();
  if (reason.length < 3) throw new DomainError("Tell us why it wasn't done (a few words is enough).", 400);
  if (reason.length > MAX_MISSED_REASON) throw new DomainError(`Keep the reason under ${MAX_MISSED_REASON} characters.`, 400);
  return {
    patch: { missedReason: reason, missedReasonAt: now, updatedAt: now },
    audit: { action: "task.missed", from: null, to: null, meta: { reason } },
    activityText: `${actor.name} said why “${task.title}” wasn't done`,
  };
}

/** Ticks, or unticks, every checklist item in one go. The same rules as one tick, and one line in the trail instead of many. */
export function planSubtaskSetAll(task: TaskData, done: boolean, actor: Actor, now: Date): TaskPlan {
  assertCanAct(task, actor);
  if (task.status === "completed" || task.status === "under_review") {
    throw new DomainError("Reopen the task to change its checklist.", 409);
  }
  const changing = task.subtasks.filter((s) => s.done !== done);
  if (changing.length === 0) throw new DomainError(done ? "Every step is already done." : "No step is ticked.", 409);

  const subtasks = task.subtasks.map((s) => (s.done === done ? s : { ...s, done, doneAt: done ? now : null, doneBy: done ? actor.uid : null }));
  const { total, done: doneCount } = countSubtasks(subtasks);
  return {
    patch: { subtasks, subtaskTotal: total, subtaskDone: doneCount, updatedAt: now },
    audit: { action: "task.subtasks", from: null, to: String(done), meta: { count: changing.length, progress: `${doneCount}/${total}` } },
    activityText: `${actor.name} ${done ? "ticked all" : "unticked all"} ${changing.length} ${changing.length === 1 ? "step" : "steps"} on “${task.title}” (${doneCount}/${total})`,
  };
}

export const MAX_PERSONAL_STEP = 120;

export type PersonalStepOp =
  | { op: "add"; title: string }
  | { op: "toggle"; stepId: string; done: boolean }
  | { op: "all"; done: boolean }
  | { op: "remove"; stepId: string };

/**
 * Someone's own list of steps on a task they were given. Only the person it belongs to can change it; the admin can read it.
 * It never changes the admin's checklist, or whether the task counts as finished.
 */
export function planPersonalSteps(task: TaskData, input: PersonalStepOp, actor: Actor, now: Date, newId: () => string): TaskPlan {
  if (actor.role === "admin") throw new DomainError("Only the person the task is for can keep steps on it.", 403);
  assertCanAct(task, actor);
  if (task.status === "completed" || task.status === "under_review") throw new DomainError("Reopen the task to change your steps.", 409);

  const mine = task.personalSteps?.[actor.uid] ?? [];
  let next: PersonalStep[];
  let audit: TaskPlan["audit"];
  let text: string;
  switch (input.op) {
    case "add": {
      const title = input.title.trim();
      if (title.length === 0) throw new DomainError("Write the step first.", 400);
      if (title.length > MAX_PERSONAL_STEP) throw new DomainError(`Keep a step under ${MAX_PERSONAL_STEP} characters.`, 400);
      if (mine.length >= MAX_PERSONAL_STEPS) throw new DomainError(`You can keep up to ${MAX_PERSONAL_STEPS} steps on one task.`, 409);
      next = [...mine, { id: newId(), title, done: false }];
      audit = { action: "task.mystep", from: null, to: "added", meta: { stepTitle: title } };
      text = `${actor.name} added their own step “${title}” on “${task.title}”`;
      break;
    }
    case "toggle": {
      const step = mine.find((s) => s.id === input.stepId);
      if (!step) throw new DomainError("That step doesn't exist.", 404);
      if (step.done === input.done) throw new DomainError("That step is already in that state.", 409);
      next = mine.map((s) => (s.id === input.stepId ? { ...s, done: input.done } : s));
      audit = { action: "task.mystep", from: null, to: input.done ? "ticked" : "unticked", meta: { stepTitle: step.title } };
      text = `${actor.name} ${input.done ? "ticked" : "unticked"} their own step “${step.title}” on “${task.title}”`;
      break;
    }
    case "all": {
      const changing = mine.filter((s) => s.done !== input.done);
      if (changing.length === 0) throw new DomainError(input.done ? "Every step is already done." : "No step is ticked.", 409);
      next = mine.map((s) => ({ ...s, done: input.done }));
      audit = { action: "task.mystep", from: null, to: input.done ? "ticked all" : "unticked all", meta: { count: changing.length } };
      text = `${actor.name} ${input.done ? "ticked all" : "unticked all"} their own steps on “${task.title}”`;
      break;
    }
    case "remove": {
      const step = mine.find((s) => s.id === input.stepId);
      if (!step) throw new DomainError("That step doesn't exist.", 404);
      next = mine.filter((s) => s.id !== input.stepId);
      audit = { action: "task.mystep", from: null, to: "removed", meta: { stepTitle: step.title } };
      text = `${actor.name} removed their own step “${step.title}” on “${task.title}”`;
      break;
    }
  }
  return { patch: { personalSteps: { ...(task.personalSteps ?? {}), [actor.uid]: next }, updatedAt: now }, audit, activityText: text };
}
