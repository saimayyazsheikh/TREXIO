import { buildDailyInstance, dailyTaskId, templateRunsOn, type TemplateData } from "@/lib/domain/task-builders";
import type { TaskData } from "@/lib/domain/tasks";
import { SYSTEM_ACTOR, type AuditEntry } from "@/lib/server/task-store";

export type GenerationDeps = {
  /** Active routines only, optionally for one employee. */
  loadTemplates(employeeId?: string): Promise<{ id: string; data: TemplateData }[]>;
  loadEmployees(ids: string[]): Promise<Map<string, { status: "active" | "disabled"; businessId: string | null }>>;
  loadBusinesses(ids: string[]): Promise<Map<string, { active: boolean; workDays: number[] }>>;
  existingTaskIds(ids: string[]): Promise<Set<string>>;
  /** Must create only documents that don't exist yet (never overwrite) and return how many it created. */
  createTasks(items: { id: string; data: TaskData }[]): Promise<number>;
  writeAudit(entry: AuditEntry): Promise<void>;
  now(): Date;
};

export type GenerationResult = { considered: number; created: number; skipped: number };

/**
 * Creates the day's task for every routine that runs on `date`. Idempotent by construction: ids are
 * `${templateId}_${employeeId}_${date}` and existing documents are never overwritten, so cron, the lazy
 * dashboard call and manual re-runs can overlap safely.
 */
export async function generateDailyTasks(deps: GenerationDeps, opts: { date: string; employeeId?: string }): Promise<GenerationResult> {
  const templates = await deps.loadTemplates(opts.employeeId);
  if (templates.length === 0) return { considered: 0, created: 0, skipped: 0 };

  const employees = await deps.loadEmployees([...new Set(templates.map((t) => t.data.employeeId))]);
  const businessIds = new Set<string>();
  for (const e of employees.values()) if (e.businessId) businessIds.add(e.businessId);
  const businesses = await deps.loadBusinesses([...businessIds]);

  const now = deps.now();
  const due: { id: string; data: TaskData }[] = [];
  for (const { id, data } of templates) {
    const employee = employees.get(data.employeeId);
    if (!employee || employee.status !== "active" || !employee.businessId) continue;
    const business = businesses.get(employee.businessId);
    if (!business || !templateRunsOn(data, business, opts.date)) continue;
    // The employee's current business wins over the one recorded when the routine was created.
    due.push({ id: dailyTaskId(id, data.employeeId, opts.date), data: buildDailyInstance({ ...data, businessId: employee.businessId }, id, opts.date, now) });
  }

  const existing = await deps.existingTaskIds(due.map((d) => d.id));
  const missing = due.filter((d) => !existing.has(d.id));
  const created = missing.length > 0 ? await deps.createTasks(missing) : 0;

  if (created > 0) {
    await deps.writeAudit({
      actorId: SYSTEM_ACTOR.uid,
      actorName: SYSTEM_ACTOR.name,
      actorRole: "system",
      action: "task.generate",
      entityType: "task",
      entityId: opts.date,
      businessId: "",
      from: null,
      to: "todo",
      meta: { date: opts.date, created, ...(opts.employeeId ? { employeeId: opts.employeeId } : {}) },
      createdAt: now,
    });
  }
  return { considered: templates.length, created, skipped: templates.length - created };
}
