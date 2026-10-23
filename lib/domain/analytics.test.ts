import { describe, expect, it } from "vitest";
import { computeAnalytics, datesBetween, lastFullWeek, toHours, weekStartOf, type AnalyticsInput, type AnalyticsTask } from "@/lib/domain/analytics";

const now = Date.parse("2026-10-21T08:00:00Z"); // Wednesday 13:00 PKT
const biz = { id: "b1", name: "Alpha", workDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "12:00" }; // 3 slots a day
const ali = { id: "ali", name: "Ali Khan", businessId: "b1", workStart: null, workEnd: null };
const sara = { id: "sara", name: "Sara Ahmed", businessId: "b1", workStart: null, workEnd: null };
const omar = { id: "omar", name: "Omar Farooq", businessId: "b2", workStart: null, workEnd: null };

const task = (o: Partial<AnalyticsTask> = {}): AnalyticsTask => ({ date: "2026-10-20", businessId: "b1", assigneeIds: ["ali"], doneBy: [], status: "todo", dueAtMs: null, completedAtMs: null, ...o });
const input = (o: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  from: "2026-10-19", to: "2026-10-21", businessId: "", nowMs: now, people: [ali, sara], businesses: [biz], tasks: [], presence: [], journals: [], blocked: [], closed: [], ...o,
});

describe("dates", () => {
  it("lists every day inclusive, and nothing for a backwards range", () => {
    expect(datesBetween("2026-10-19", "2026-10-21")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(datesBetween("2026-10-21", "2026-10-19")).toEqual([]);
  });
  it("finds the Monday of a week and the last full week", () => {
    expect(weekStartOf("2026-10-21")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(lastFullWeek("2026-10-21")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(lastFullWeek("2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
});

describe("completion and timing", () => {
  const due = Date.parse("2026-10-20T10:00:00Z");
  const tasks = [
    task({ status: "completed", dueAtMs: due, completedAtMs: due - 1000 }), // on time
    task({ status: "completed", dueAtMs: due, completedAtMs: due + 1000 }), // late
    task({ status: "todo", dueAtMs: due }), // overdue and open: late
    task({ status: "todo", dueAtMs: now + 3_600_000 }), // not due yet: neither
    task({ status: "completed" }), // no deadline: neither
  ];
  const a = computeAnalytics(input({ tasks }));
  it("counts tasks, completions and the rate", () => {
    expect(a.kpis).toMatchObject({ total: 5, completed: 3, completedPct: 60 });
  });
  it("on-time versus late includes open overdue work and ignores tasks with no deadline", () => {
    expect(a.kpis).toMatchObject({ onTime: 1, late: 2, onTimePct: 33 });
  });
  it("ignores tasks outside the period and, with a business filter, other businesses", () => {
    const b = computeAnalytics(input({ tasks: [...tasks, task({ date: "2026-09-01" }), task({ businessId: "b2" })], businessId: "b1" }));
    expect(b.kpis.total).toBe(5);
  });
  it("an empty period is all zeros, not NaN", () => {
    const e = computeAnalytics(input());
    expect(e.kpis).toEqual({ total: 0, completed: 0, completedPct: 0, onTime: 0, late: 0, onTimePct: 0, avgActiveHours: 0, journalPct: 0, blocked: 0 });
  });
});

describe("trend", () => {
  it("is daily for a short period, with a zero-filled bucket for each day", () => {
    const a = computeAnalytics(input({ tasks: [task({ date: "2026-10-20", status: "completed" }), task({ date: "2026-10-20" })] }));
    expect(a.trend.granularity).toBe("day");
    expect(a.trend.points.map((p) => p.key)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(a.trend.points[1]).toMatchObject({ total: 2, completed: 1, completedPct: 50 });
    expect(a.trend.points[0]).toMatchObject({ total: 0, completedPct: null });
  });
  it("switches to weeks for a long period", () => {
    const a = computeAnalytics(input({ from: "2026-08-24", to: "2026-10-21", tasks: [task({ date: "2026-10-20", status: "completed" })] }));
    expect(a.trend.granularity).toBe("week");
    expect(a.trend.points.at(-1)).toMatchObject({ key: "2026-10-19", total: 1, completed: 1 });
    expect(a.trend.points[0].key).toBe("2026-08-24");
  });
});

describe("per person", () => {
  it("counts a person's own part as done on shared tasks", () => {
    const a = computeAnalytics(input({ tasks: [task({ assigneeIds: ["ali", "sara"], doneBy: ["ali"] }), task({ assigneeIds: ["sara"], status: "completed" })] }));
    const row = (id: string) => a.employees.find((e) => e.id === id)!;
    expect(row("ali")).toMatchObject({ assigned: 1, done: 1, donePct: 100 });
    expect(row("sara")).toMatchObject({ assigned: 2, done: 1, donePct: 50 });
    expect(a.employees[0].id).toBe("ali"); // best first
  });
  it("adds up active, idle and break time and the days someone was seen", () => {
    const a = computeAnalytics(input({
      presence: [
        { employeeId: "ali", date: "2026-10-19", activeSec: 3600, idleSec: 600, breakSec: 300 },
        { employeeId: "ali", date: "2026-10-20", activeSec: 7200, idleSec: 0, breakSec: 0 },
        { employeeId: "ali", date: "2026-09-01", activeSec: 99999, idleSec: 0, breakSec: 0 }, // outside
        { employeeId: "ghost", date: "2026-10-19", activeSec: 5000, idleSec: 0, breakSec: 0 }, // not in this view
      ],
    }));
    expect(a.employees.find((e) => e.id === "ali")).toMatchObject({ activeSec: 10800, idleSec: 600, breakSec: 300, daysSeen: 2 });
    expect(a.kpis.avgActiveHours).toBe(1.5);
  });
  it("journal fill counts only working days that have started, skipping closures", () => {
    // Mon 19 and Tue 20 count (3 slots each); Wed 21 has started; the business is closed on the 20th.
    const slots = { "09": { text: "x", taskIds: [] }, "10": { text: "", taskIds: ["t1"] } };
    const a = computeAnalytics(input({ journals: [{ employeeId: "ali", date: "2026-10-19", slots }], closed: [{ date: "2026-10-20", businessId: null }] }));
    const row = a.employees.find((e) => e.id === "ali")!;
    expect(row.journalExpected).toBe(6); // 19th and 21st
    expect(row.journalFilled).toBe(2);
    expect(row.journalPct).toBe(33);
  });
  it("never expects a journal for a day that hasn't started", () => {
    const a = computeAnalytics(input({ to: "2026-10-24" }));
    expect(a.employees[0].journalExpected).toBe(9); // 19, 20, 21 only
  });
  it("filters people by business", () => {
    const a = computeAnalytics(input({ people: [ali, omar], businessId: "b1" }));
    expect(a.employees.map((e) => e.id)).toEqual(["ali"]);
  });
});

describe("blocked reasons and workload", () => {
  it("groups the same reason regardless of case and spacing, most common first, top eight", () => {
    const blocked = [
      ...Array.from({ length: 3 }, () => ({ reason: "Waiting for supplier", businessId: "b1" })),
      { reason: " waiting  for SUPPLIER ", businessId: "b1" },
      { reason: "Printer is down", businessId: "b1" },
      { reason: "   ", businessId: "b1" },
      { reason: "Other business thing", businessId: "b2" },
    ];
    const a = computeAnalytics(input({ blocked, businessId: "b1" }));
    expect(a.blockedReasons).toEqual([{ reason: "Waiting for supplier", count: 4 }, { reason: "Printer is down", count: 1 }]);
    expect(a.kpis.blocked).toBe(6);
    const many = Array.from({ length: 12 }, (_, i) => ({ reason: `Reason ${i}`, businessId: "b1" }));
    expect(computeAnalytics(input({ blocked: many })).blockedReasons).toHaveLength(8);
  });
  it("workload counts a person's tasks by weekday", () => {
    const a = computeAnalytics(input({ tasks: [task({ date: "2026-10-19" }), task({ date: "2026-10-19" }), task({ date: "2026-10-21", assigneeIds: ["ali", "sara"] })] }));
    const w = a.workload.find((r) => r.id === "ali")!;
    expect(w.counts).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(w.max).toBe(2);
    expect(a.workload.find((r) => r.id === "sara")!.counts[2]).toBe(1);
  });
});

describe("toHours", () => {
  it("rounds to one decimal", () => {
    expect(toHours(5400)).toBe(1.5);
    expect(toHours(0)).toBe(0);
  });
});

describe("employeesCsv", () => {
  it("writes one safe line per person with hours, not seconds", async () => {
    const { employeesCsv } = await import("@/lib/domain/analytics");
    const a = computeAnalytics(input({ people: [{ ...ali, name: "=Ali" }], presence: [{ employeeId: "ali", date: "2026-10-19", activeSec: 5400, idleSec: 0, breakSec: 0 }] }));
    const csv = employeesCsv(a.employees, { from: "2026-10-19", to: "2026-10-21" }, () => "Alpha, Inc");
    const lines = csv.replace("﻿", "").trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("Person,Business")).toBe(true);
    expect(lines[1]).toContain("'=Ali");
    expect(lines[1]).toContain('"Alpha, Inc"');
    expect(lines[1]).toContain(",1.5,");
  });
});
