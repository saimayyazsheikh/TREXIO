import { csvCell } from "@/lib/domain/audit-log";
import { effectiveHours, fillStats, isWorkingDay, workSlots, type Slots } from "@/lib/domain/journal";
import { dateStringFromDayIndex, dayIndexFromDateString, isoWeekdayOfDate } from "@/lib/time";

export type AnalyticsPerson = { id: string; name: string; businessId: string | null; workStart: string | null; workEnd: string | null };
export type AnalyticsBusiness = { id: string; name: string; workDays: number[]; workStart: string; workEnd: string };
export type AnalyticsTask = {
  date: string;
  businessId: string;
  assigneeIds: string[];
  /** Who has ticked their own part. */
  doneBy: string[];
  status: string;
  dueAtMs: number | null;
  completedAtMs: number | null;
};

export type AnalyticsInput = {
  from: string;
  to: string;
  /** Empty string means every business. */
  businessId: string;
  nowMs: number;
  people: AnalyticsPerson[];
  businesses: AnalyticsBusiness[];
  tasks: AnalyticsTask[];
  presence: { employeeId: string; date: string; activeSec: number; idleSec: number; breakSec: number }[];
  journals: { employeeId: string; date: string; slots: Slots }[];
  /** Reasons given when a task was blocked (from the audit trail), in the period. */
  blocked: { reason: string; businessId: string }[];
  closed: { date: string; businessId: string | null }[];
};

export type TrendPoint = { key: string; label: string; total: number; completed: number; /** null on a day with no tasks, so charts show a gap rather than a false 0%. */ completedPct: number | null; onTime: number; late: number };
export type EmployeeRow = {
  id: string;
  name: string;
  businessId: string | null;
  assigned: number;
  done: number;
  donePct: number;
  activeSec: number;
  idleSec: number;
  breakSec: number;
  daysSeen: number;
  journalFilled: number;
  journalExpected: number;
  journalPct: number;
};

export type Analytics = {
  kpis: { total: number; completed: number; completedPct: number; onTime: number; late: number; onTimePct: number; avgActiveHours: number; journalPct: number; blocked: number };
  trend: { granularity: "day" | "week"; points: TrendPoint[] };
  employees: EmployeeRow[];
  blockedReasons: { reason: string; count: number }[];
  /** Tasks per person per ISO weekday (index 0 = Monday). */
  workload: { id: string; name: string; counts: number[]; max: number }[];
};

export const MAX_DAYS = 120;
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function datesBetween(from: string, to: string): string[] {
  const a = dayIndexFromDateString(from);
  const b = dayIndexFromDateString(to);
  if (b < a) return [];
  return Array.from({ length: Math.min(b - a + 1, MAX_DAYS) }, (_, i) => dateStringFromDayIndex(a + i));
}

/** Monday of the ISO week containing `date`. */
export const weekStartOf = (date: string) => dateStringFromDayIndex(dayIndexFromDateString(date) - (isoWeekdayOfDate(date) - 1));

/** The most recent Monday-to-Sunday week that has fully finished before `today`. */
export function lastFullWeek(today: string): { from: string; to: string } {
  const thisMonday = weekStartOf(today);
  const from = dateStringFromDayIndex(dayIndexFromDateString(thisMonday) - 7);
  return { from, to: dateStringFromDayIndex(dayIndexFromDateString(from) + 6) };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const isDoneFor = (t: AnalyticsTask, uid: string) => t.status === "completed" || t.doneBy.includes(uid);

/** How a completed or overdue task counts toward on-time versus late. Open tasks not yet due count as neither. */
function timing(t: AnalyticsTask, nowMs: number): "onTime" | "late" | null {
  if (t.dueAtMs === null) return null;
  if (t.status === "completed") return t.completedAtMs !== null && t.completedAtMs <= t.dueAtMs ? "onTime" : "late";
  return t.dueAtMs < nowMs ? "late" : null;
}

const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function computeAnalytics(input: AnalyticsInput): Analytics {
  const { from, to, businessId, nowMs } = input;
  const dates = datesBetween(from, to);
  const inRange = (d: string) => d >= from && d <= to;
  const people = input.people.filter((p) => !businessId || p.businessId === businessId);
  const personIds = new Set(people.map((p) => p.id));
  const tasks = input.tasks.filter((t) => inRange(t.date) && (!businessId || t.businessId === businessId));
  const bById = new Map(input.businesses.map((b) => [b.id, b]));

  /* Headline numbers and the trend count each task once. */
  const completed = tasks.filter((t) => t.status === "completed").length;
  let onTime = 0;
  let late = 0;
  for (const t of tasks) {
    const k = timing(t, nowMs);
    if (k === "onTime") onTime++;
    else if (k === "late") late++;
  }

  const weekly = dates.length > 31;
  const keyOf = (d: string) => (weekly ? weekStartOf(d) : d);
  const buckets = new Map<string, TrendPoint>();
  for (const d of dates) {
    const key = keyOf(d);
    if (!buckets.has(key)) buckets.set(key, { key, label: weekly ? `Week of ${dateLabel(key)}` : dateLabel(key), total: 0, completed: 0, completedPct: 0, onTime: 0, late: 0 });
  }
  for (const t of tasks) {
    const b = buckets.get(keyOf(t.date));
    if (!b) continue;
    b.total++;
    if (t.status === "completed") b.completed++;
    const k = timing(t, nowMs);
    if (k === "onTime") b.onTime++;
    else if (k === "late") b.late++;
  }
  const points = [...buckets.values()].map((b) => ({ ...b, completedPct: b.total > 0 ? pct(b.completed, b.total) : null }));

  /* Per person. */
  const presence = input.presence.filter((p) => inRange(p.date) && personIds.has(p.employeeId));
  const closedOn = (date: string, biz: string | null) => input.closed.some((c) => c.date === date && (c.businessId === null || c.businessId === biz));

  const employees: EmployeeRow[] = people.map((p) => {
    const mine = tasks.filter((t) => t.assigneeIds.includes(p.id));
    const done = mine.filter((t) => isDoneFor(t, p.id)).length;
    const rows = presence.filter((r) => r.employeeId === p.id);
    const business = p.businessId ? bById.get(p.businessId) : undefined;

    let journalFilled = 0;
    let journalExpected = 0;
    if (business) {
      const hours = effectiveHours(p, business);
      const slotKeys = workSlots(hours.start, hours.end);
      const docs = new Map(input.journals.filter((j) => j.employeeId === p.id).map((j) => [j.date, j.slots]));
      for (const d of dates) {
        // Only days that have started: a day in the future can't have been logged yet.
        if (Date.parse(`${d}T00:00:00+05:00`) > nowMs) continue;
        if (!isWorkingDay(business.workDays, d) || closedOn(d, p.businessId)) continue;
        const stats = fillStats(docs.get(d), slotKeys);
        journalFilled += stats.filled;
        journalExpected += stats.expected;
      }
    }
    return {
      id: p.id,
      name: p.name,
      businessId: p.businessId,
      assigned: mine.length,
      done,
      donePct: pct(done, mine.length),
      activeSec: rows.reduce((s, r) => s + r.activeSec, 0),
      idleSec: rows.reduce((s, r) => s + r.idleSec, 0),
      breakSec: rows.reduce((s, r) => s + r.breakSec, 0),
      daysSeen: rows.filter((r) => r.activeSec + r.idleSec + r.breakSec > 0).length,
      journalFilled,
      journalExpected,
      journalPct: pct(journalFilled, journalExpected),
    };
  });

  const activeSec = employees.reduce((s, e) => s + e.activeSec, 0);
  const daysSeen = employees.reduce((s, e) => s + e.daysSeen, 0);
  const jf = employees.reduce((s, e) => s + e.journalFilled, 0);
  const je = employees.reduce((s, e) => s + e.journalExpected, 0);

  /* Blocked reasons: the same words in different case or spacing count together. */
  const reasons = new Map<string, { reason: string; count: number }>();
  for (const b of input.blocked) {
    if (businessId && b.businessId !== businessId) continue;
    const text = b.reason.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = text.toLowerCase();
    const hit = reasons.get(key);
    if (hit) hit.count++;
    else reasons.set(key, { reason: text, count: 1 });
  }
  const blockedReasons = [...reasons.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)).slice(0, 8);

  const workload = people
    .map((p) => {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const t of tasks) if (t.assigneeIds.includes(p.id)) counts[isoWeekdayOfDate(t.date) - 1]++;
      return { id: p.id, name: p.name, counts, max: Math.max(...counts) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    kpis: {
      total: tasks.length,
      completed,
      completedPct: pct(completed, tasks.length),
      onTime,
      late,
      onTimePct: pct(onTime, onTime + late),
      avgActiveHours: daysSeen ? Math.round((activeSec / daysSeen / 3600) * 10) / 10 : 0,
      journalPct: pct(jf, je),
      blocked: input.blocked.filter((b) => !businessId || b.businessId === businessId).length,
    },
    trend: { granularity: weekly ? "week" : "day", points },
    employees: employees.sort((a, b) => b.donePct - a.donePct || b.done - a.done || a.name.localeCompare(b.name)),
    blockedReasons,
    workload,
  };
}

/** Whole hours with one decimal: 5400 seconds is 1.5. */
export const toHours = (sec: number) => Math.round((sec / 3600) * 10) / 10;

/** The per-person table as a spreadsheet file (formula-safe cells, BOM and CRLF so Excel opens it cleanly). */
export function employeesCsv(rows: EmployeeRow[], period: { from: string; to: string }, businessName: (id: string | null) => string): string {
  const head = ["Person", "Business", "From", "To", "Tasks assigned", "Tasks done", "Done %", "Active hours", "Idle hours", "Break hours", "Days seen", "Journal hours logged", "Journal hours expected", "Journal fill %"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.name, businessName(r.businessId), period.from, period.to, r.assigned, r.done, r.donePct, toHours(r.activeSec), toHours(r.idleSec), toHours(r.breakSec), r.daysSeen, r.journalFilled, r.journalExpected, r.journalPct]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
