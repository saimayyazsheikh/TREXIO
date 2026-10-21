import { DomainError } from "@/lib/domain/errors";
import type { Priority } from "@/lib/domain/constants";
import { countSubtasks, type Actor, type Subtask, type TaskData, type TaskPlan } from "@/lib/domain/tasks";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/domain/task-schemas";
import { isoWeekdayOfDate, pktInstant } from "@/lib/time";

export type TemplateData = {
  employeeId: string;
  businessId: string;
  title: string;
  description: string;
  priority: Priority;
  dueTime: string | null;
  subtasks: { id: string; title: string }[];
  /** ISO weekdays this routine runs on (1 = Monday … 7 = Sunday). */
  activeDays: number[];
  active: boolean;
  order: number;
  updatedAt: Date;
};

type Assignee = { uid: string; businessId: string };

const dueAtFor = (date: string, dueTime: string | null) => (dueTime ? pktInstant(date, dueTime) : null);
const freshSubtask = (id: string, title: string): Subtask => ({ id, title, done: false, doneAt: null, doneBy: null });

function baseTask(now: Date, createdBy: string): Pick<
  TaskData,
  "completion" | "completionMode" | "blockedReason" | "blockedBy" | "relatedTaskIds" | "dependsOnIds" | "attachments" | "tags" | "createdBy" | "createdAt" | "updatedAt" | "completedAt" | "escalation" | "status"
> {
  return {
    status: "todo", completion: {}, completionMode: "all", blockedReason: null, blockedBy: null,
    relatedTaskIds: [], dependsOnIds: [], attachments: [], tags: [], createdBy, createdAt: now, updatedAt: now,
    completedAt: null, escalation: { l1At: null, l2At: null },
  };
}

export function buildOneOffTask(input: CreateTaskInput, assignee: Assignee, actor: Actor, now: Date, newId: () => string): TaskData {
  const subtasks = input.subtasks.map((t) => freshSubtask(newId(), t));
  return {
    ...baseTask(now, actor.uid),
    kind: "oneoff",
    templateId: null,
    date: input.date,
    businessId: assignee.businessId,
    assigneeIds: [assignee.uid],
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueAt: dueAtFor(input.date, input.dueTime),
    requiresReview: input.requiresReview,
    subtasks,
    subtaskTotal: subtasks.length,
    subtaskDone: 0,
  };
}

/** Admin edit of a one-off task. Existing checklist items keep their progress when their id is kept. */
export function planTaskUpdate(task: TaskData, input: UpdateTaskInput, assignee: Assignee, actor: Actor, now: Date, newId: () => string): TaskPlan {
  if (actor.role !== "admin") throw new DomainError("Only the admin can edit tasks.", 403);
  if (task.kind === "daily") throw new DomainError("Daily tasks are edited on their routine, so tomorrow's copy changes too.", 409);

  const existing = new Map(task.subtasks.map((s) => [s.id, s]));
  const subtasks = input.subtasks.map((s) => {
    const kept = s.id ? existing.get(s.id) : undefined;
    return kept ? { ...kept, title: s.title } : freshSubtask(newId(), s.title);
  });
  const { total, done } = countSubtasks(subtasks);
  if (task.status === "completed" && done < total) {
    throw new DomainError("Reopen the task before adding new checklist steps.", 409);
  }

  const next: Partial<TaskData> = {
    title: input.title,
    description: input.description,
    priority: input.priority,
    date: input.date,
    dueAt: dueAtFor(input.date, input.dueTime),
    requiresReview: input.requiresReview,
    assigneeIds: [assignee.uid],
    businessId: assignee.businessId,
    subtasks,
    subtaskTotal: total,
    subtaskDone: done,
    ...(input.attachments ? { attachments: input.attachments } : {}),
    updatedAt: now,
  };
  const changed = (Object.keys(next) as (keyof TaskData)[]).filter((k) => k !== "updatedAt" && JSON.stringify(next[k]) !== JSON.stringify(task[k]));
  if (changed.length === 0) throw new DomainError("Nothing changed.", 409);

  return {
    patch: next,
    audit: { action: "task.update", from: null, to: null, meta: { changed } },
    activityText: `${actor.name} edited “${input.title}”`,
  };
}

export const dailyTaskId = (templateId: string, employeeId: string, date: string) => `${templateId}_${employeeId}_${date}`;

/** Does this routine produce a task on `date`? (Holidays and leave are layered on in Phase 6.) */
export function templateRunsOn(template: Pick<TemplateData, "active" | "activeDays">, business: { active: boolean; workDays: number[] }, date: string): boolean {
  const weekday = isoWeekdayOfDate(date);
  return template.active && business.active && business.workDays.includes(weekday) && template.activeDays.includes(weekday);
}

/** The editable content a routine stamps onto each day's task. */
export function routineFields(template: TemplateData, date: string) {
  const subtasks = template.subtasks.map((s) => freshSubtask(s.id, s.title));
  return {
    businessId: template.businessId,
    title: template.title,
    description: template.description,
    priority: template.priority,
    dueAt: dueAtFor(date, template.dueTime),
    subtasks,
    subtaskTotal: subtasks.length,
    subtaskDone: 0,
  };
}

export function buildDailyInstance(template: TemplateData, templateId: string, date: string, now: Date): TaskData {
  return {
    ...baseTask(now, "system"),
    kind: "daily",
    templateId,
    date,
    assigneeIds: [template.employeeId],
    requiresReview: false,
    ...routineFields(template, date),
  };
}

/** A routine edit may rewrite today's copy only while nobody has touched it. History is never rewritten. */
export function isUntouched(task: Pick<TaskData, "status" | "subtaskDone">): boolean {
  return task.status === "todo" && task.subtaskDone === 0;
}
