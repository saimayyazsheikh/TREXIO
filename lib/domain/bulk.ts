import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { PRIORITIES } from "@/lib/domain/constants";
import type { TaskData } from "@/lib/domain/tasks";
import { pktHour, pktMinute } from "@/lib/time";

/** Most tasks one bulk action may touch, so a mistake stays small and a request stays fast. */
export const MAX_BULK = 50;

export const bulkSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1, "Select at least one task").max(MAX_BULK, `Select up to ${MAX_BULK} tasks at a time`).transform((ids) => [...new Set(ids)]),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("priority"), priority: z.enum(PRIORITIES) }),
    z.object({ kind: z.literal("date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date") }),
    z.object({ kind: z.literal("assign"), assigneeIds: z.array(z.string().min(1)).min(1, "Choose who it is for").max(25) }),
    z.object({ kind: z.literal("delete") }),
  ]),
});
export type BulkInput = z.infer<typeof bulkSchema>;
export type BulkChange = BulkInput["change"];

export type BulkResult = { done: number; failed: { id: string; title: string; message: string }[] };

const hhmm = (d: Date) => `${String(pktHour(d)).padStart(2, "0")}:${String(pktMinute(d)).padStart(2, "0")}`;

export type TaskEditChanges = {
  title?: string;
  description?: string;
  client?: string;
  estimateMin?: number | null;
  priority?: TaskData["priority"];
  date?: string;
  dueTime?: string;
  assigneeIds?: string[];
};

/**
 * The edit form's own values for a task, with the given things changed and everything else as it is. Feeding this to the normal
 * edit keeps every rule, check and audit line of a single edit, so a bulk change (or the assistant) can never do something one
 * edit couldn't.
 */
export function taskEditInput(task: TaskData, taskId: string, changes: TaskEditChanges) {
  if (task.kind === "daily") throw new DomainError("Daily routines are changed on their routine, not one day at a time.", 409);
  return {
    taskId,
    title: changes.title ?? task.title,
    description: changes.description ?? task.description,
    client: changes.client ?? task.client ?? "",
    estimateMin: changes.estimateMin !== undefined ? changes.estimateMin : (task.estimateMin ?? null),
    priority: changes.priority ?? task.priority,
    date: changes.date ?? task.date,
    dueTime: changes.dueTime !== undefined ? changes.dueTime : task.dueAt ? hhmm(task.dueAt) : "",
    requiresReview: task.requiresReview,
    assigneeIds: changes.assigneeIds ?? task.assigneeIds,
    completionMode: task.completionMode,
    dependsOnIds: task.dependsOnIds,
    relatedTaskIds: task.relatedTaskIds,
    subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title })),
  };
}

/** One bulk change (priority, day or assignee) applied to a task, as the edit form's values. */
export function editWith(task: TaskData, taskId: string, change: Exclude<BulkChange, { kind: "delete" }>) {
  if (task.kind === "daily") throw new DomainError("Daily routines are changed on their routine, not in bulk.", 409);
  return taskEditInput(task, taskId, change.kind === "priority" ? { priority: change.priority } : change.kind === "date" ? { date: change.date } : { assigneeIds: change.assigneeIds });
}
