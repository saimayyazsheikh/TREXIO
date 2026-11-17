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

/**
 * The edit form's own values for a task with one thing changed. Feeding this to the normal edit keeps every rule, check and
 * audit line of a single edit, so a bulk change can never do something one edit couldn't.
 */
export function editWith(task: TaskData, taskId: string, change: Exclude<BulkChange, { kind: "delete" }>) {
  if (task.kind === "daily") throw new DomainError("Daily routines are changed on their routine, not in bulk.", 409);
  return {
    taskId,
    title: task.title,
    description: task.description,
    priority: change.kind === "priority" ? change.priority : task.priority,
    date: change.kind === "date" ? change.date : task.date,
    dueTime: task.dueAt ? hhmm(task.dueAt) : "",
    requiresReview: task.requiresReview,
    assigneeIds: change.kind === "assign" ? change.assigneeIds : task.assigneeIds,
    completionMode: task.completionMode,
    dependsOnIds: task.dependsOnIds,
    relatedTaskIds: task.relatedTaskIds,
    subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title })),
  };
}
