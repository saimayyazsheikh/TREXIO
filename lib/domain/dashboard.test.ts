import { describe, expect, it } from "vitest";
import { dashboardStats } from "@/lib/domain/dashboard";

const now = new Date("2026-10-21T10:00:00Z");
const today = "2026-10-21";
const row = (status: Parameters<typeof dashboardStats>[0][number]["status"], over: Partial<Parameters<typeof dashboardStats>[0][number]> = {}) => ({ status, dueAt: null, date: today, ...over });

describe("dashboardStats", () => {
  it("counts today's tasks, completion percentage, blocked and in review", () => {
    const s = dashboardStats([row("completed"), row("todo"), row("blocked"), row("under_review")], [], now, today);
    expect(s).toMatchObject({ total: 4, completed: 1, completedPct: 25, blocked: 1, inReview: 1, overdue: 0 });
  });
  it("counts overdue tasks by due time, and carried-over untimed tasks from earlier days", () => {
    const s = dashboardStats(
      [row("todo", { dueAt: new Date("2026-10-21T08:00:00Z") }), row("todo", { dueAt: new Date("2026-10-21T12:00:00Z") })],
      [row("todo", { date: "2026-10-20" }), row("completed", { date: "2026-10-19" })],
      now,
      today,
    );
    expect(s.overdue).toBe(2);
  });
  it("includes blocked carried-over work but ignores finished carried-over work", () => {
    const s = dashboardStats([], [row("blocked", { date: "2026-10-18" }), row("completed", { date: "2026-10-18" })], now, today);
    expect(s).toMatchObject({ total: 0, completedPct: 0, blocked: 1 });
  });
});
