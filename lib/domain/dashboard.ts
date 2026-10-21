import { dueState } from "@/lib/domain/tasks";
import type { TaskStatus } from "@/lib/domain/constants";

type Row = { status: TaskStatus; dueAt: Date | null; date: string };

export type DashboardStats = { total: number; completed: number; completedPct: number; overdue: number; blocked: number; inReview: number };

/** KPI numbers for the admin dashboard from today's tasks plus unfinished one-off tasks carried over from earlier. */
export function dashboardStats(today: Row[], carried: Row[], now: Date, todayPkt: string): DashboardStats {
  const open = carried.filter((t) => t.status !== "completed");
  const all = [...today, ...open];
  const completed = today.filter((t) => t.status === "completed").length;
  return {
    total: today.length,
    completed,
    completedPct: today.length ? Math.round((completed / today.length) * 100) : 0,
    overdue: all.filter((t) => dueState(t, now, todayPkt) === "overdue").length,
    blocked: all.filter((t) => t.status === "blocked").length,
    inReview: all.filter((t) => t.status === "under_review").length,
  };
}
