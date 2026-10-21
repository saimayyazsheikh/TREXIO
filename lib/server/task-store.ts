import { DomainError } from "@/lib/domain/errors";
import type { TaskStatus } from "@/lib/domain/constants";
import { planSubtaskToggle, planTransition, type Actor, type TaskData, type TaskPlan } from "@/lib/domain/tasks";
import { buildOneOffTask, planTaskUpdate, type TemplateData } from "@/lib/domain/task-builders";
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

async function loadActiveEmployee(tx: TaskTx, uid: string) {
  const user = await tx.getUser(uid);
  if (!user || user.role !== "employee" || !user.businessId) throw new DomainError("That team member doesn't exist.", 400);
  if (user.status !== "active") throw new DomainError(`${user.name} is turned off. Turn them back on first.`, 409);
  return { user, assignee: { uid, businessId: user.businessId } };
}

export function transitionTask(db: TaskDb, actor: Actor, input: { taskId: string; status: TaskStatus; reason?: string }) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const now = db.now();
    commitTaskPlan(tx, actor, input.taskId, task, planTransition(task, input.status, actor, { reason: input.reason, now }), now);
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
    const { user, assignee } = await loadActiveEmployee(tx, input.assigneeId);
    const now = db.now();
    const taskId = db.newId();
    const data = buildOneOffTask(input, assignee, actor, now, db.newId);
    const plan: TaskPlan = {
      patch: {},
      audit: { action: "task.create", from: null, to: "todo", meta: { assigneeId: assignee.uid, priority: data.priority, date: data.date } },
      activityText: `${actor.name} assigned “${data.title}” to ${user.name}`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: data.businessId }, plan, now);
    tx.setTask(taskId, data);
    tx.addAudit(audit);
    tx.addActivity(activity);
    return { taskId };
  });
}

export function updateOneOffTask(db: TaskDb, actor: Actor, input: UpdateTaskInput) {
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, input.taskId);
    const { assignee } = await loadActiveEmployee(tx, input.assigneeId);
    const now = db.now();
    commitTaskPlan(tx, actor, input.taskId, task, planTaskUpdate(task, input, assignee, actor, now, db.newId), now);
  });
}

export async function deleteTask(db: TaskDb, actor: Actor, taskId: string) {
  if (actor.role !== "admin") throw new DomainError("Only the admin can delete tasks.", 403);
  return db.transaction(async (tx) => {
    const task = await loadTask(tx, taskId);
    const now = db.now();
    const plan: TaskPlan = {
      patch: {},
      audit: { action: "task.delete", from: task.status, to: null, meta: { title: task.title, kind: task.kind, date: task.date } },
      activityText: `${actor.name} deleted “${task.title}”`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "task", entityId: taskId, businessId: task.businessId }, plan, now);
    tx.deleteTask(taskId);
    tx.addAudit(audit);
    tx.addActivity(activity);
  });
}
