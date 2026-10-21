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

/** Real Storage links are https; the local emulator serves plain http on localhost, which is allowed too. */
const isStorageUrl = (u: string) => u.startsWith("https://") || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u);

export const attachmentSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().refine(isStorageUrl, "Attachments must come from file storage"),
  size: z.number().int().min(0).max(10 * 1024 * 1024),
  type: z.string().max(100),
});

const uniqueIds = (max: number, what: string) =>
  z
    .array(z.string().min(1))
    .max(max, `Up to ${max} ${what}`)
    .transform((ids) => [...new Set(ids)]);

const assigneeIds = uniqueIds(10, "people per task").pipe(z.array(z.string()).min(1, "Choose who it's for"));

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
  attachments: z.array(attachmentSchema).max(10, "Up to 10 attachments").optional(),
  ...taskRelations,
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const deleteTaskSchema = z.object({ taskId: z.string().min(1) });

export const transitionSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  reason: z.string().max(500).optional(),
});

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
