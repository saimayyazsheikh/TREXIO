import { PRIORITIES, TASK_STATUSES, type Priority, type TaskStatus } from "@/lib/domain/constants";
import { compareTasks } from "@/lib/domain/task-sort";
import { dateStringFromDayIndex, dayIndexFromDateString, isoWeekdayOfDate } from "@/lib/time";

export const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number]["id"];

/** Inclusive PKT date range (`YYYY-MM-DD`) for a preset. Weeks run Monday to Sunday. */
export function rangeFor(preset: DatePreset, today: string): { start: string; end: string } {
  const idx = dayIndexFromDateString(today);
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "week": {
      const monday = idx - (isoWeekdayOfDate(today) - 1);
      return { start: dateStringFromDayIndex(monday), end: dateStringFromDayIndex(monday + 6) };
    }
    case "last7":
      return { start: dateStringFromDayIndex(idx - 6), end: today };
    case "last30":
      return { start: dateStringFromDayIndex(idx - 29), end: today };
  }
}

export type BoardTask = {
  id: string;
  status: TaskStatus;
  priority: Priority;
  title: string;
  businessId: string;
  assigneeIds: string[];
  assigneeNames: Record<string, string>;
  dueAtMs: number | null;
};

export type BoardFilters = { search: string; priority: Priority | ""; businessId: string; employeeId: string };

export const NO_FILTERS: BoardFilters = { search: "", priority: "", businessId: "", employeeId: "" };

export function filterTasks<T extends BoardTask>(tasks: T[], f: BoardFilters): T[] {
  const term = f.search.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!f.priority || t.priority === f.priority) &&
      (!f.businessId || t.businessId === f.businessId) &&
      (!f.employeeId || t.assigneeIds.includes(f.employeeId)) &&
      (!term || t.title.toLowerCase().includes(term) || Object.values(t.assigneeNames).some((n) => n.toLowerCase().includes(term))),
  );
}

export type GroupBy = "none" | "employee" | "business";
export type Lane<T> = { key: string; label: string; tasks: T[] };

/** Splits tasks into swimlanes. A task with several assignees appears once in each of their lanes. */
export function groupLanes<T extends BoardTask>(tasks: T[], by: GroupBy, labels: { business: (id: string) => string }): Lane<T>[] {
  if (by === "none") return [{ key: "all", label: "", tasks }];
  const lanes = new Map<string, Lane<T>>();
  const add = (key: string, label: string, t: T) => {
    const lane = lanes.get(key) ?? { key, label, tasks: [] };
    lane.tasks.push(t);
    lanes.set(key, lane);
  };
  for (const t of tasks) {
    if (by === "business") add(t.businessId, labels.business(t.businessId), t);
    else for (const uid of t.assigneeIds) add(uid, t.assigneeNames[uid] ?? "Unknown", t);
  }
  return [...lanes.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Tasks of one column, in display order (open work first, High before Low, earliest due). */
export function columnTasks<T extends BoardTask>(tasks: T[], status: TaskStatus): T[] {
  return tasks.filter((t) => t.status === status).sort(compareTasks);
}

export const BOARD_STATUSES = TASK_STATUSES;
export const BOARD_PRIORITIES = PRIORITIES;
