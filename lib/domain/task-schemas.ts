import { z } from "zod";
import { PRIORITIES, TASK_STATUSES } from "@/lib/domain/constants";
import { MAX_DEPENDENCIES, MAX_RELATED } from "@/lib/domain/dependencies";
import { workDaysSchema } from "@/lib/domain/schemas";

const hhmmOrEmpty = z
  .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 17:30")])
  .transform((v) => v || null);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const title = z.string().trim().min(2, "Give it a short title").max(120, "Keep the title under 120 characters");
const description = z.string().trim().max(2000, "Keep the description under 2000 characters").default("");

const subtaskTitle = z.string().trim().min(1).max(120, "Keep each step under 120 characters");

/** Checklist items on create: plain titles. Blank lines are dropped. */
const newSubtasks = z
  .array(z.string().trim().max(120))
  .max(30, "A checklist can have up to 30 steps")
  .transform((items) => items.filter(Boolean));

/** Checklist items on edit: keep `id` so progress on existing steps is preserved. */
const editedSubtasks = z
  .array(z.object({ id: z.string().min(1).max(40).optional(), title: subtaskTitle }))
  .max(30, "A checklist can have up to 30 steps");

/** Form-side checklist: blank rows are dropped and titles trimmed, so half-typed steps never block saving. */
export const formChecklistSchema = z
  .array(z.object({ id: z.string().optional(), title: z.string().max(120, "Keep each step under 120 characters") }))
  .max(30, "A checklist can have up to 30 steps")
  .transform((items) => items.map((i) => ({ ...i, title: i.title.trim() })).filter((i) => i.title));

const uniqueIds = (max: number, what: string) =>
  z
    .array(z.string().min(1))
    .max(max, `Up to ${max} ${what}`)
    .transform((ids) => [...new Set(ids)]);

/** Up to the workspace size: a task can go to several businesses at once (one copy per business). */
const assigneeIds = uniqueIds(25, "people per task").pipe(z.array(z.string()).min(1, "Choose who it's for"));

/** Shared by create and edit: who, how it completes, and links to other tasks. */
const taskRelations = {
  assigneeIds,
  /** "all": every assignee must finish their part. "any": the first to finish completes it. */
  completionMode: z.enum(["all", "any"]).default("all"),
  /** Prerequisites: this task can't start or finish until they are completed. */
  dependsOnIds: uniqueIds(MAX_DEPENDENCIES, "prerequisites").default([]),
  /** Informational two-way links. */
  relatedTaskIds: uniqueIds(MAX_RELATED, "related tasks").default([]),
};

export const createTaskSchema = z.object({
  title,
  description,
  priority: z.enum(PRIORITIES),
  date,
  dueTime: hhmmOrEmpty,
  requiresReview: z.boolean().default(false),
  subtasks: newSubtasks.default([]),
  ...taskRelations,
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title,
  description,
  priority: z.enum(PRIORITIES),
  date,
  dueTime: hhmmOrEmpty,
  requiresReview: z.boolean(),
  subtasks: editedSubtasks,
  ...taskRelations,
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** An edit to one day's copy of a daily routine: its words, priority, time and checklist. The routine itself and the person are untouched. */
export const updateDailyTodaySchema = z.object({
  taskId: z.string().min(1),
  title,
  description,
  priority: z.enum(PRIORITIES),
  dueTime: hhmmOrEmpty,
  subtasks: editedSubtasks,
});
export type UpdateDailyTodayInput = z.infer<typeof updateDailyTodaySchema>;

export const deleteTaskSchema = z.object({ taskId: z.string().min(1) });

export const transitionSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  reason: z.string().max(500).optional(),
});

export const commentSchema = z.object({
  taskId: z.string().min(1),
  text: z.string().trim().min(1, "Write a note first").max(500, "Keep the note under 500 characters"),
  about: z.enum(["comment", "finish", "step"]).default("comment"),
  subtaskTitle: z.string().trim().max(120).optional(),
});

export const missedReasonSchema = z.object({ taskId: z.string().min(1), reason: z.string().trim().min(3, "Tell us why it wasn't done (a few words is enough)").max(300, "Keep the reason under 300 characters") });

export const subtaskToggleSchema = z.object({ taskId: z.string().min(1), subtaskId: z.string().min(1), done: z.boolean() });

const templateBase = {
  title,
  description,
  priority: z.enum(PRIORITIES),
  dueTime: hhmmOrEmpty,
  subtasks: editedSubtasks,
  activeDays: workDaysSchema,
  active: z.boolean(),
};

export const createTemplateSchema = z.object({ employeeId: z.string().min(1, "Choose who it's for"), ...templateBase });
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({ templateId: z.string().min(1), ...templateBase });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const deleteTemplateSchema = z.object({ templateId: z.string().min(1) });
