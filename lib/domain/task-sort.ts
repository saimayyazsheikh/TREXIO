import { PRIORITY_WEIGHT, type Priority, type TaskStatus } from "@/lib/domain/constants";

type Sortable = { status: TaskStatus; priority: Priority; title: string; dueAtMs: number | null };

/** Open work first; then earliest due time (untimed last); then High before Low; then A–Z. Completed tasks sink. */
export function compareTasks(a: Sortable, b: Sortable): number {
  const doneA = a.status === "completed" ? 1 : 0;
  const doneB = b.status === "completed" ? 1 : 0;
  if (doneA !== doneB) return doneA - doneB;
  if (a.dueAtMs !== b.dueAtMs) {
    if (a.dueAtMs === null) return 1;
    if (b.dueAtMs === null) return -1;
    return a.dueAtMs - b.dueAtMs;
  }
  if (a.priority !== b.priority) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  return a.title.localeCompare(b.title);
}
