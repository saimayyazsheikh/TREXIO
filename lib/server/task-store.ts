import { DomainError } from "@/lib/domain/errors";
import type { TaskStatus } from "@/lib/domain/constants";
import { assertNoDependencyCycle, diffIds } from "@/lib/domain/dependencies";
import { planSubtaskToggle, planTransition, type Actor, type DependencySnapshot, type TaskData, type TaskPlan } from "@/lib/domain/tasks";
import { buildOneOffTask, planTaskUpdate, type Assignee, type ResolvedLinks, type TemplateData } from "@/lib/domain/task-builders";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/domain/task-schemas";

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
  const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: plan.patch.businessId ?? task.businessId }, plan, now);
  tx.updateTask(taskId, plan.patch);
  tx.addAudit(audit);
  tx.addActivity(activity);
}

async function loadTask(tx: TaskTx, taskId: string): Promise<TaskData> {
  const task = await tx.getTask(taskId);
  if (!task) throw new DomainError("That task doesn't exist any more.", 404);
  return task;
}

/** Active employees from one business, in the order given. */
async function loadAssignees(tx: TaskTx, uids: string[]): Promise<Assignee[]> {
  const assignees: Assignee[] = [];
  for (const uid of uids) {
    const user = await tx.getUser(uid);
    if (!user || user.role !== "employee" || !user.businessId) throw new DomainError("That team member doesn't exist.", 400);
    if (user.status !== "active") throw new DomainError(`${user.name} is turned off. Turn them back on first.`, 409);
    assignees.push({ uid, name: user.name, businessId: user.businessId });
  }
  if (new Set(assignees.map((a) => a.businessId)).size > 1) throw new DomainError("Everyone on a task must be from the same business.", 400);
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

export function toggleSubtask(db: TaskDb, actor: Actor, input: { taskId: string; subtaskId: string; done: boolean }) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    commitTaskPlan(tx, actor, input.taskId, task, planSubtaskToggle(task, input.subtaskId, input.done, actor, now), now);
  });
}

export async function createOneOffTask(db: TaskDb, actor: Actor, input: CreateTaskInput): Promise<{ taskId: string }> {
  if (actor.role !== "admin") throw new DomainError("Only the admin can assign tasks.", 403);
  return db.transaction(async (tx) => {
    const assignees = await loadAssignees(tx, input.assigneeIds);
    const { links, targets } = await resolveLinks(tx, null, input.dependsOnIds, input.relatedTaskIds);
    const now = db.now();
    const taskId = db.newId();
    const data = buildOneOffTask(input, assignees, actor, now, db.newId, links);
    const names = assignees.map((a) => a.name).join(", ");
    const plan: TaskPlan = {
      patch: {},
      audit: {
        action: "task.create",
        from: null,
        to: "todo",
        meta: { assigneeIds: data.assigneeIds, priority: data.priority, date: data.date, ...(data.dependsOnIds.length ? { dependsOnIds: data.dependsOnIds } : {}) },
      },
      activityText: `${actor.name} assigned “${data.title}” to ${names}`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: data.businessId }, plan, now);
    tx.setTask(taskId, data);
    // Related links are two-way: each linked task learns about the new one.
    for (const id of input.relatedTaskIds) {
      const t = targets.get(id)!;
      tx.updateTask(id, { relatedTaskIds: [...new Set([...t.relatedTaskIds, taskId])], linkTitles: { ...t.linkTitles, [taskId]: data.title }, updatedAt: now });
    }
    tx.addAudit(audit);
    tx.addActivity(activity);
    return { taskId };
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
