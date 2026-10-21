import { DomainError } from "@/lib/domain/errors";
import type { Actor, TaskPlan } from "@/lib/domain/tasks";
import { dailyTaskId, isUntouched, routineFields, type TemplateData } from "@/lib/domain/task-builders";
import type { CreateTemplateInput, UpdateTemplateInput } from "@/lib/domain/task-schemas";
import { auditAndActivity, commitTaskPlan, SYSTEM_ACTOR, type TaskDb } from "@/lib/server/task-store";
import { pktDateString } from "@/lib/time";

function requireAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new DomainError("Only the admin can manage daily routines.", 403);
}

export async function createTemplate(db: TaskDb, actor: Actor, input: CreateTemplateInput): Promise<{ templateId: string }> {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const user = await tx.getUser(input.employeeId);
    if (!user || user.role !== "employee" || !user.businessId) throw new DomainError("That team member doesn't exist.", 400);
    if (user.status !== "active") throw new DomainError(`${user.name} is turned off. Turn them back on first.`, 409);

    const now = db.now();
    const templateId = db.newId();
    const data: TemplateData = {
      employeeId: input.employeeId,
      businessId: user.businessId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueTime: input.dueTime,
      subtasks: input.subtasks.map((s) => ({ id: s.id ?? db.newId(), title: s.title })),
      activeDays: input.activeDays,
      active: input.active,
      // Creation time keeps routines in the order the admin added them.
      order: now.getTime(),
      updatedAt: now,
    };
    const plan: TaskPlan = {
      patch: {},
      audit: { action: "template.create", from: null, to: null, meta: { employeeId: data.employeeId, days: data.activeDays } },
      activityText: `${actor.name} added the daily routine “${data.title}” for ${user.name}`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "template", entityId: templateId, businessId: data.businessId }, plan, now);
    tx.setTemplate(templateId, data);
    tx.addAudit(audit);
    tx.addActivity(activity);
    return { templateId };
  });
}

/**
 * Edits a routine. Changes apply from today onward: today's copy is rewritten only if nobody has touched it,
 * and earlier days are never changed.
 */
export async function updateTemplate(db: TaskDb, actor: Actor, input: UpdateTemplateInput): Promise<void> {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const current = await tx.getTemplate(input.templateId);
    if (!current) throw new DomainError("That routine doesn't exist any more.", 404);
    const now = db.now();
    const today = pktDateString(now);
    const todays = await tx.getTask(dailyTaskId(input.templateId, current.employeeId, today));

    const next: TemplateData = {
      ...current,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueTime: input.dueTime,
      subtasks: input.subtasks.map((s) => ({ id: s.id ?? db.newId(), title: s.title })),
      activeDays: input.activeDays,
      active: input.active,
      updatedAt: now,
    };
    const plan: TaskPlan = {
      patch: {},
      audit: { action: "template.update", from: current.active ? "active" : "paused", to: next.active ? "active" : "paused", meta: { employeeId: current.employeeId } },
      activityText: `${actor.name} ${current.active && !next.active ? "paused" : !current.active && next.active ? "resumed" : "updated"} the daily routine “${next.title}”`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "template", entityId: input.templateId, businessId: current.businessId }, plan, now);
    tx.updateTemplate(input.templateId, next);
    tx.addAudit(audit);
    tx.addActivity(activity);

    if (todays && isUntouched(todays) && next.active) {
      const refresh: TaskPlan = {
        patch: { ...routineFields(next, today), updatedAt: now },
        audit: { action: "task.refresh", from: null, to: null, meta: { templateId: input.templateId } },
        activityText: `Today's “${next.title}” was refreshed from its routine`,
      };
      commitTaskPlan(tx, SYSTEM_ACTOR, dailyTaskId(input.templateId, current.employeeId, today), todays, refresh, now);
    }
  });
}

export async function deleteTemplate(db: TaskDb, actor: Actor, templateId: string): Promise<void> {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const current = await tx.getTemplate(templateId);
    if (!current) throw new DomainError("That routine doesn't exist any more.", 404);
    const now = db.now();
    const plan: TaskPlan = {
      patch: {},
      audit: { action: "template.delete", from: null, to: null, meta: { title: current.title, employeeId: current.employeeId } },
      activityText: `${actor.name} deleted the daily routine “${current.title}”`,
    };
    const { audit, activity } = auditAndActivity(actor, { entityType: "template", entityId: templateId, businessId: current.businessId }, plan, now);
    tx.deleteTemplate(templateId);
    tx.addAudit(audit);
    tx.addActivity(activity);
  });
}
