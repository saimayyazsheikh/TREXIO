import { DomainError } from "@/lib/domain/errors";
import type { TaskStatus } from "@/lib/domain/constants";
import { assertNoDependencyCycle, diffIds } from "@/lib/domain/dependencies";
import { planComment, planMissedReason, planSubtaskToggle, planTransition, type Actor, type DependencySnapshot, type TaskData, type TaskNote, type TaskPlan } from "@/lib/domain/tasks";
import { pktDateString } from "@/lib/time";
import { buildOneOffTask, planDailyEdit, planTaskUpdate, type Assignee, type ResolvedLinks, type TemplateData } from "@/lib/domain/task-builders";
import type { CreateTaskInput, UpdateDailyTodayInput, UpdateTaskInput } from "@/lib/domain/task-schemas";

export const ACTIVITY_TTL_DAYS = 90;

export type AuditEntry = {
  actorId: string;
  actorName: string;
  actorRole: Actor["role"] | "system";
  action: string;
  entityType: "task" | "template";
  entityId: string;
  businessId: string;
  from: string | null;
  to: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
};

export type ActivityEntry = {
  actorId: string;
  actorName: string;
  businessId: string;
  type: string;
  entityType: "task" | "template";
  entityId: string;
  text: string;
  createdAt: Date;
  /** Firestore TTL field: the activity feed forgets entries after 90 days. */
  expireAt: Date;
};

export type AssigneeRecord = { name: string; businessId: string | null; role: Actor["role"]; status: "active" | "disabled" };

/** Who the audit trail credits for automated changes (cron generation, routine refreshes). */
export const SYSTEM_ACTOR = { uid: "system", name: "Traxio", role: "system" } as const;

/** Everything a task change may touch, scoped to one atomic transaction. Reads must come before writes. */
export type TaskTx = {
  getTask(id: string): Promise<TaskData | null>;
  /** Tasks that list `taskId` as a prerequisite or as a related task. */
  getTasksLinkingTo(taskId: string): Promise<{ id: string; task: TaskData }[]>;
  getUser(uid: string): Promise<AssigneeRecord | null>;
  setTask(id: string, data: TaskData): void;
  updateTask(id: string, patch: Partial<TaskData>): void;
  deleteTask(id: string): void;
  getTemplate(id: string): Promise<TemplateData | null>;
  setTemplate(id: string, data: TemplateData): void;
  updateTemplate(id: string, patch: Partial<TemplateData>): void;
  deleteTemplate(id: string): void;
  addAudit(entry: AuditEntry): void;
  addActivity(entry: ActivityEntry): void;
};

export type TaskDb = {
  transaction<T>(fn: (tx: TaskTx) => Promise<T>): Promise<T>;
  now(): Date;
  /** Short random id for new tasks and checklist items. */
  newId(): string;
};

export function auditAndActivity(
  actor: { uid: string; name: string; role: AuditEntry["actorRole"] },
  ref: { entityType: AuditEntry["entityType"]; entityId: string; businessId: string },
  plan: Pick<TaskPlan, "audit" | "activityText">,
  now: Date,
): { audit: AuditEntry; activity: ActivityEntry } {
  return {
    audit: { actorId: actor.uid, actorName: actor.name, actorRole: actor.role, ...ref, ...plan.audit, createdAt: now },
    activity: {
      actorId: actor.uid,
      actorName: actor.name,
      businessId: ref.businessId,
      type: plan.audit.action,
      entityType: ref.entityType,
      entityId: ref.entityId,
      text: plan.activityText,
      createdAt: now,
      expireAt: new Date(now.getTime() + ACTIVITY_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  };
}

/**
 * THE shared writer: applies a planned change to a task together with its audit and activity entries.
 * All task mutations in the app go through here so nothing is ever changed without a trail.
 */
export function commitTaskPlan(
  tx: TaskTx,
  actor: { uid: string; name: string; role: AuditEntry["actorRole"] },
  taskId: string,
  task: TaskData,
  plan: TaskPlan,
  now: Date,
): void {
  // Every audit line names its task, so the log can say which one without looking it up.
  const named: TaskPlan = { ...plan, audit: { ...plan.audit, meta: { title: plan.patch.title ?? task.title, ...plan.audit.meta } } };
  const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: plan.patch.businessId ?? task.businessId }, named, now);
  tx.updateTask(taskId, plan.patch);
  tx.addAudit(audit);
  tx.addActivity(activity);
}

async function loadTask(tx: TaskTx, taskId: string): Promise<TaskData> {
  const task = await tx.getTask(taskId);
  if (!task) throw new DomainError("That task doesn't exist any more.", 404);
  return task;
}

/** Active employees, in the order given. Unless `anyBusiness`, they must all be from one business. */
async function loadAssignees(tx: TaskTx, uids: string[], opts: { anyBusiness?: boolean } = {}): Promise<Assignee[]> {
  const assignees: Assignee[] = [];
  for (const uid of uids) {
    const user = await tx.getUser(uid);
    if (!user || user.role !== "employee" || !user.businessId) throw new DomainError("That team member doesn't exist.", 400);
    if (user.status !== "active") throw new DomainError(`${user.name} is turned off. Turn them back on first.`, 409);
    assignees.push({ uid, name: user.name, businessId: user.businessId });
  }
  if (!opts.anyBusiness && new Set(assignees.map((a) => a.businessId)).size > 1) throw new DomainError("Everyone on a task must be from the same business.", 400);
  return assignees;
}

async function loadDependencySnapshots(tx: TaskTx, ids: string[]): Promise<DependencySnapshot[]> {
  const snapshots: DependencySnapshot[] = [];
  for (const id of ids) {
    const t = await tx.getTask(id);
    if (t) snapshots.push({ id, title: t.title, status: t.status });
  }
  return snapshots;
}

/** Loads link targets, checks they can be linked, and (when editing) rejects dependency loops. */
async function resolveLinks(tx: TaskTx, selfId: string | null, dependsOnIds: string[], relatedIds: string[]) {
  const targets = new Map<string, TaskData>();
  for (const id of new Set([...dependsOnIds, ...relatedIds])) {
    if (id === selfId && relatedIds.includes(id) && !dependsOnIds.includes(id)) throw new DomainError("A task can't be related to itself.", 400);
    if (id === selfId) continue; // self-dependency is reported by the cycle check below
    const t = await tx.getTask(id);
    if (!t) throw new DomainError("One of the linked tasks no longer exists.", 404);
    if (t.kind !== "oneoff") throw new DomainError("Only one-off tasks can be linked. Daily routine tasks can't.", 400);
    targets.set(id, t);
  }
  if (selfId) {
    await assertNoDependencyCycle(selfId, dependsOnIds, async (id) => (targets.get(id) ?? (await tx.getTask(id)))?.dependsOnIds ?? []);
  }
  const links: ResolvedLinks = {
    dependsOn: dependsOnIds.map((id) => ({ id, title: targets.get(id)!.title, status: targets.get(id)!.status })),
    related: relatedIds.map((id) => ({ id, title: targets.get(id)!.title })),
  };
  return { links, targets };
}

const without = <T>(list: readonly T[], item: T) => list.filter((x) => x !== item);

export function transitionTask(db: TaskDb, actor: Actor, input: { taskId: string; status: TaskStatus; reason?: string }) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    const deps = await loadDependencySnapshots(tx, task.dependsOnIds);
    const plan = planTransition(task, input.status, actor, { reason: input.reason, now, deps });

    // When this task becomes completed (or stops being completed), tasks waiting on it must be told.
    const wasDone = task.status === "completed";
    const isDone = (plan.patch.status ?? task.status) === "completed";
    const dependents = wasDone !== isDone ? (await tx.getTasksLinkingTo(input.taskId)).filter((d) => d.task.dependsOnIds.includes(input.taskId)) : [];

    commitTaskPlan(tx, actor, input.taskId, task, plan, now);
    for (const d of dependents) {
      const waiting = isDone ? without(d.task.waitingOnIds, input.taskId) : [...new Set([...d.task.waitingOnIds, input.taskId])];
      tx.updateTask(d.id, { waitingOnIds: waiting, updatedAt: now });
    }
  });
}

/**
 * Ticks or unticks a step. When an assigned person ticks the LAST step, their part of the task is finished too, the same as if
 * they had pressed the circle (so it can land in Under Review, or wait for teammates). If finishing isn't allowed yet, for
 * example while it waits on another task, the step is still ticked and nothing else happens.
 */
export function toggleSubtask(db: TaskDb, actor: Actor, input: { taskId: string; subtaskId: string; done: boolean }) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    const toggled = planSubtaskToggle(task, input.subtaskId, input.done, actor, now);
    const after: TaskData = { ...task, ...toggled.patch };

    // Reads first (a transaction may not read after it has written).
    let finish: { plan: TaskPlan; dependents: { id: string; task: TaskData }[]; completes: boolean } | null = null;
    const lastStep = input.done && after.subtaskTotal > 0 && after.subtaskDone === after.subtaskTotal;
    if (lastStep && actor.role === "employee" && (after.status === "todo" || after.status === "in_progress") && !after.completion[actor.uid]?.done) {
      try {
        const deps = await loadDependencySnapshots(tx, after.dependsOnIds);
        const plan = planTransition(after, "completed", actor, { now, deps });
        const completes = (plan.patch.status ?? after.status) === "completed";
        const dependents = completes ? (await tx.getTasksLinkingTo(input.taskId)).filter((d) => d.task.dependsOnIds.includes(input.taskId)) : [];
        finish = { plan, dependents, completes };
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
    }

    if (!finish) return commitTaskPlan(tx, actor, input.taskId, task, toggled, now);
    // One write for the task, two lines in the trail: the tick, then the finish.
    commitTaskPlan(tx, actor, input.taskId, task, { ...toggled, patch: { ...toggled.patch, ...finish.plan.patch } }, now);
    const second = auditAndActivity(actor, { entityType: "task", entityId: input.taskId, businessId: task.businessId }, { ...finish.plan, audit: { ...finish.plan.audit, meta: { title: task.title, ...finish.plan.audit.meta } } }, now);
    tx.addAudit(second.audit);
    tx.addActivity(second.activity);
    for (const d of finish.dependents) tx.updateTask(d.id, { waitingOnIds: without(d.task.waitingOnIds, input.taskId), updatedAt: now });
  });
}

/** Adds a comment to a task (see planComment). */
export function commentOnTask(db: TaskDb, actor: Actor, input: { taskId: string; text: string; about?: TaskNote["about"]; subtaskTitle?: string | null }) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    commitTaskPlan(tx, actor, input.taskId, task, planComment(task, input, actor, now, db.newId), now);
  });
}

/** The person a missed daily routine was for says why it wasn't done. */
export function explainMissedRoutine(db: TaskDb, actor: Actor, input: { taskId: string; reason: string }) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    commitTaskPlan(tx, actor, input.taskId, task, planMissedReason(task, input.reason, actor, now, pktDateString(now)), now);
  });
}

/**
 * Assigns a one-off task. People from several businesses are allowed: each business gets its own copy of the task (its own
 * colour, status and completion), shared by the people chosen from that business. Returns every task made, first one first.
 */
export async function createOneOffTask(db: TaskDb, actor: Actor, input: CreateTaskInput): Promise<{ taskId: string; taskIds: string[] }> {
  if (actor.role !== "admin") throw new DomainError("Only the admin can assign tasks.", 403);
  return db.transaction(async (tx) => {
    const everyone = await loadAssignees(tx, input.assigneeIds, { anyBusiness: true });
    const { links, targets } = await resolveLinks(tx, null, input.dependsOnIds, input.relatedTaskIds);
    const now = db.now();

    const groups = new Map<string, Assignee[]>();
    for (const a of everyone) groups.set(a.businessId, [...(groups.get(a.businessId) ?? []), a]);

    const made: { taskId: string; title: string }[] = [];
    for (const assignees of groups.values()) {
      const taskId = db.newId();
      const data = buildOneOffTask({ ...input, assigneeIds: assignees.map((a) => a.uid) }, assignees, actor, now, db.newId, links);
      const names = assignees.map((a) => a.name).join(", ");
      const plan: TaskPlan = {
        patch: {},
        audit: {
          action: "task.create",
          from: null,
          to: "todo",
          meta: { title: data.title, assigneeIds: data.assigneeIds, assigneeNames: assignees.map((a) => a.name), priority: data.priority, date: data.date, ...(data.dependsOnIds.length ? { dependsOnIds: data.dependsOnIds } : {}) },
        },
        activityText: `${actor.name} assigned “${data.title}” to ${names}`,
      };
      const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: data.businessId }, plan, now);
      tx.setTask(taskId, data);
      tx.addAudit(audit);
      tx.addActivity(activity);
      made.push({ taskId, title: data.title });
    }

    // Related links are two-way: each linked task learns about every new copy (one write per linked task).
    for (const id of input.relatedTaskIds) {
      const t = targets.get(id)!;
      tx.updateTask(id, {
        relatedTaskIds: [...new Set([...t.relatedTaskIds, ...made.map((m) => m.taskId)])],
        linkTitles: { ...t.linkTitles, ...Object.fromEntries(made.map((m) => [m.taskId, m.title])) },
        updatedAt: now,
      });
    }
    return { taskId: made[0].taskId, taskIds: made.map((m) => m.taskId) };
  });
}

export function updateOneOffTask(db: TaskDb, actor: Actor, input: UpdateTaskInput) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const assignees = await loadAssignees(tx, input.assigneeIds);
    const { links, targets } = await resolveLinks(tx, input.taskId, input.dependsOnIds, input.relatedTaskIds);
    const now = db.now();
    const plan = planTaskUpdate(task, input, assignees, links, actor, now, db.newId);

    // Everything below that reads must happen before the first write.
    const { added, removed } = diffIds(task.relatedTaskIds, input.relatedTaskIds);
    const removedTargets = new Map<string, TaskData>();
    for (const id of removed) {
      const t = await tx.getTask(id);
      if (t) removedTargets.set(id, t);
    }
    const renamed = input.title !== task.title;
    const linkers = renamed ? await tx.getTasksLinkingTo(input.taskId) : [];

    commitTaskPlan(tx, actor, input.taskId, task, plan, now);

    const edits = new Map<string, Partial<TaskData>>();
    const patchOf = (id: string, base: TaskData) => ({ ...base, ...edits.get(id) });
    for (const id of added) {
      const t = patchOf(id, targets.get(id)!);
      edits.set(id, { relatedTaskIds: [...new Set([...t.relatedTaskIds, input.taskId])], linkTitles: { ...t.linkTitles, [input.taskId]: input.title }, updatedAt: now });
    }
    for (const [id, base] of removedTargets) {
      const t = patchOf(id, base);
      const stillLinked = t.dependsOnIds.includes(input.taskId);
      const titles = { ...t.linkTitles };
      if (!stillLinked) delete titles[input.taskId];
      edits.set(id, { relatedTaskIds: without(t.relatedTaskIds, input.taskId), linkTitles: titles, updatedAt: now });
    }
    for (const { id, task: other } of linkers) {
      if (id === input.taskId) continue;
      const t = patchOf(id, other);
      edits.set(id, { ...edits.get(id), linkTitles: { ...t.linkTitles, [input.taskId]: input.title }, updatedAt: now });
    }
    for (const [id, patch] of edits) tx.updateTask(id, patch);
  });
}

/** Edits one day's copy of a daily routine. The routine, and every other day, are left alone. */
export function updateDailyForToday(db: TaskDb, actor: Actor, input: UpdateDailyTodayInput) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    commitTaskPlan(tx, actor, input.taskId, task, planDailyEdit(task, input, actor, now, db.newId), now);
  });
}

export async function deleteTask(db: TaskDb, actor: Actor, taskId: string) {
  if (actor.role !== "admin") throw new DomainError("Only the admin can delete tasks.", 403);
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, taskId);
    const linkers = await tx.getTasksLinkingTo(taskId);
    const now = db.now();
    const plan: TaskPlan = {
      patch: {},
      audit: { action: "task.delete", from: task.status, to: null, meta: { title: task.title, kind: task.kind, date: task.date } },
      activityText: `${actor.name} deleted “${task.title}”`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: task.businessId }, plan, now);
    tx.deleteTask(taskId);
    // Nothing may keep waiting on, or pointing at, a task that no longer exists.
    for (const { id, task: other } of linkers) {
      const titles = { ...other.linkTitles };
      delete titles[taskId];
      tx.updateTask(id, {
        dependsOnIds: without(other.dependsOnIds, taskId),
        waitingOnIds: without(other.waitingOnIds, taskId),
        relatedTaskIds: without(other.relatedTaskIds, taskId),
        linkTitles: titles,
        updatedAt: now,
      });
    }
    tx.addAudit(audit);
    tx.addActivity(activity);
  });
}
