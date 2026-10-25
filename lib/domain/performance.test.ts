import { describe, expect, it } from "vitest";
import { buildPerformance, type PerformanceInput, type PerformanceTask } from "@/lib/domain/performance";
import { pktInstant } from "@/lib/time";

const at = (date: string, hhmm: string) => pktInstant(date, hhmm).getTime();
const task = (id: string, over: Partial<PerformanceTask> = {}): PerformanceTask => ({
  id, title: id, kind: "oneoff", date: "2026-10-21", status: "todo", priority: "medium", dueAtMs: null, completedAtMs: null, doneByMe: false, blockedReason: null, missedReason: null, ...over,
});

const base = (over: Partial<PerformanceInput> = {}): PerformanceInput => ({
  from: "2026-10-20",
  to: "2026-10-22",
  today: "2026-10-23",
  nowMs: at("2026-10-23", "12:00"),
  person: { id: "ali", name: "Ali", workStart: null, workEnd: null },
  business: { id: "b1", name: "Alpha", workDays: [1, 2, 3, 4, 5, 6, 7], workStart: "09:00", workEnd: "11:00" },
  tasks: [],
  journals: [],
  presence: [],
  away: [],
  closed: [],
  ...over,
});

describe("buildPerformance: tasks", () => {
  it("counts finished, still open and not done, with on-time and late", () => {
    const r = buildPerformance(
      base({
        tasks: [
          task("a", { status: "completed", dueAtMs: at("2026-10-21", "17:00"), completedAtMs: at("2026-10-21", "16:00"), doneByMe: true }),
          task("b", { status: "completed", dueAtMs: at("2026-10-21", "17:00"), completedAtMs: at("2026-10-21", "18:30"), doneByMe: true }),
          task("c", { kind: "daily", dueAtMs: at("2026-10-21", "09:30"), missedReason: "No stock" }),
          task("d", { kind: "daily", dueAtMs: at("2026-10-22", "09:30") }),
          task("e", { status: "blocked", blockedReason: "waiting" }),
          task("f", { date: "2026-10-22", dueAtMs: at("2026-10-24", "10:00") }),
          task("outside", { date: "2026-09-01", status: "completed", doneByMe: true }),
        ],
      }),
    );
    expect(r.tasks).toMatchObject({ assigned: 6, done: 2, notDone: 2, notDoneWithReason: 1, blocked: 1, onTime: 1, late: 3, donePct: 33 });
    expect(r.open.map((t) => t.id)).toEqual(["f", "e"]);
    expect(r.missed.map((t) => t.id)).toEqual(["d", "c"]);
    expect(r.done.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("counts your own tick on a shared task as done", () => {
    const r = buildPerformance(base({ tasks: [task("shared", { status: "in_progress", doneByMe: true })] }));
    expect(r.tasks).toMatchObject({ assigned: 1, done: 1, open: 0 });
  });

  it("is all zeros with nothing to report", () => {
    const r = buildPerformance(base());
    expect(r.tasks).toMatchObject({ assigned: 0, donePct: 0, onTimePct: 0 });
    expect(r.journal).toMatchObject({ filled: 0, expected: 6, pct: 0 });
  });
});

describe("buildPerformance: someone who just joined", () => {
  it("counts nothing before the day they were added", () => {
    const r = buildPerformance(base({ person: { id: "ali", name: "Ali", workStart: null, workEnd: null, joinedOn: "2026-10-22" } }));
    expect(r.attendance.days.map((d) => d.date)).toEqual(["2026-10-22"]);
    expect(r.attendance.absent).toBe(1);
    expect(r.journal).toMatchObject({ expected: 2 });
    expect(r.journal.days.map((d) => d.date)).toEqual(["2026-10-22"]);
  });
  it("covers the whole period for someone who was already there", () => {
    const r = buildPerformance(base({ person: { id: "ali", name: "Ali", workStart: null, workEnd: null, joinedOn: "2026-01-01" } }));
    expect(r.attendance.days).toHaveLength(3);
  });
});

describe("buildPerformance: journal, attendance and time", () => {
  it("measures the journal over working days that have started", () => {
    const r = buildPerformance(
      base({
        journals: [{ date: "2026-10-20", slots: { "09": { text: "work", taskIds: [] } } }],
        closed: [{ date: "2026-10-22", businessId: null }],
        to: "2026-10-24",
      }),
    );
    // 20th and 21st count (2 hours each), the 22nd is a holiday, the 23rd and 24th have not finished starting: the 23rd has, the 24th has not.
    expect(r.journal.days.map((d) => d.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-23"]);
    expect(r.journal).toMatchObject({ filled: 1, expected: 6, pct: 17 });
  });

  it("reads attendance from the first time seen, leave and the calendar", () => {
    const r = buildPerformance(
      base({
        presence: [
          { date: "2026-10-20", activeSec: 3600, idleSec: 0, breakSec: 0, firstSeenMs: at("2026-10-20", "08:55"), lastSeenMs: at("2026-10-20", "11:00") },
          { date: "2026-10-21", activeSec: 1800, idleSec: 600, breakSec: 0, firstSeenMs: at("2026-10-21", "10:00"), lastSeenMs: at("2026-10-21", "11:00") },
        ],
        away: [{ kind: "leave", fromDate: "2026-10-22", toDate: "2026-10-22", fromTime: null, toTime: null }],
      }),
    );
    expect(r.attendance).toMatchObject({ present: 1, late: 1, leave: 1, absent: 0 });
    expect(r.presence).toMatchObject({ activeSec: 5400, idleSec: 600, daysSeen: 2, avgActiveSec: 2700 });
  });
});

import { buildTeamReports } from "@/lib/domain/performance";

describe("buildTeamReports", () => {
  it("gives each person their own tasks, journal, presence and leave", () => {
    const biz = { id: "b1", name: "Alpha", workDays: [1, 2, 3, 4, 5, 6, 7], workStart: "09:00", workEnd: "11:00" };
    const reports = buildTeamReports({
      from: "2026-10-21",
      to: "2026-10-21",
      today: "2026-10-23",
      nowMs: at("2026-10-23", "12:00"),
      people: [
        { id: "ali", name: "Ali", businessId: "b1", workStart: null, workEnd: null },
        { id: "sara", name: "Sara", businessId: "b1", workStart: null, workEnd: null },
      ],
      businesses: [biz],
      tasks: [
        { id: "t1", title: "Shared", kind: "oneoff", date: "2026-10-21", status: "in_progress", priority: "high", dueAtMs: null, completedAtMs: null, blockedReason: null, missedReason: null, assigneeIds: ["ali", "sara"], doneBy: ["ali"], businessId: "b1" },
        { id: "t2", title: "Sara only", kind: "oneoff", date: "2026-10-21", status: "todo", priority: "low", dueAtMs: null, completedAtMs: null, blockedReason: null, missedReason: null, assigneeIds: ["sara"], doneBy: [], businessId: "b1" },
      ],
      journals: [{ employeeId: "ali", date: "2026-10-21", slots: { "09": { text: "x", taskIds: [] }, "10": { text: "y", taskIds: [] } } }],
      presence: [{ employeeId: "sara", date: "2026-10-21", activeSec: 600, idleSec: 0, breakSec: 0, firstSeenMs: at("2026-10-21", "09:00"), lastSeenMs: at("2026-10-21", "09:30") }],
      away: [{ employeeId: "ali", kind: "leave", fromDate: "2026-10-21", toDate: "2026-10-21", fromTime: null, toTime: null }],
      closed: [],
    });
    const [ali, sara] = reports;
    expect(ali.report.tasks).toMatchObject({ assigned: 1, done: 1 });
    expect(sara.report.tasks).toMatchObject({ assigned: 2, done: 0 });
    expect(ali.report.journal).toMatchObject({ filled: 2, expected: 2, pct: 100 });
    expect(ali.report.attendance.leave).toBe(1);
    expect(sara.report.attendance.present).toBe(1);
    expect(sara.report.presence.activeSec).toBe(600);
    expect(ali.business?.name).toBe("Alpha");
  });
});
