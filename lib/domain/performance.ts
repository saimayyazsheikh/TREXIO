import { attendanceForDay, summarize, type AwayRequest, type DayResult, type MonthSummary } from "@/lib/domain/attendance";
import { datesBetween } from "@/lib/domain/analytics";
import { effectiveHours, fillStats, isWorkingDay, workSlots, type Slots } from "@/lib/domain/journal";
import { isClosedFor } from "@/lib/domain/timeoff";
import { isMissed } from "@/lib/domain/tasks";
import { pktHour, pktMinute } from "@/lib/time";

export type PerformanceTask = {
  id: string;
  title: string;
  kind: "daily" | "oneoff";
  date: string;
  status: string;
  priority: string;
  dueAtMs: number | null;
  completedAtMs: number | null;
  /** This person has ticked their own part (or the whole task is completed). */
  doneByMe: boolean;
  blockedReason: string | null;
  missedReason: string | null;
};

export type PerformanceInput = {
  from: string;
  to: string;
  today: string;
  nowMs: number;
  /** `joinedOn` is the day they were added; nothing before it is counted against them. */
  person: { id: string; name: string; workStart: string | null; workEnd: string | null; joinedOn?: string };
  business: { id: string; name: string; workDays: number[]; workStart: string; workEnd: string } | null;
  tasks: PerformanceTask[];
  journals: { date: string; slots: Slots }[];
  presence: { date: string; activeSec: number; idleSec: number; breakSec: number; firstSeenMs: number; lastSeenMs: number }[];
  /** Approved leave and short excuses only. */
  away: AwayRequest[];
  closed: { date: string; businessId: string | null }[];
};

export type PerformanceReport = {
  tasks: {
    assigned: number;
    done: number;
    open: number;
    blocked: number;
    /** Daily routines whose time passed without being done. */
    notDone: number;
    notDoneWithReason: number;
    onTime: number;
    late: number;
    donePct: number;
    onTimePct: number;
  };
  done: PerformanceTask[];
  open: PerformanceTask[];
  missed: PerformanceTask[];
  journal: { filled: number; expected: number; pct: number; days: { date: string; filled: number; expected: number }[] };
  attendance: MonthSummary & { days: { date: string; result: DayResult }[] };
  presence: { activeSec: number; idleSec: number; breakSec: number; daysSeen: number; avgActiveSec: number };
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const minuteOfDay = (ms: number) => pktHour(new Date(ms)) * 60 + pktMinute(new Date(ms));

/** One person's report for a period: tasks finished and not, journal, attendance and time in Traxio. */
export function buildPerformance(i: PerformanceInput): PerformanceReport {
  // The report starts on the day the person joined, so days before that are neither absent nor an empty journal.
  const first = i.person.joinedOn && i.person.joinedOn > i.from ? i.person.joinedOn : i.from;
  const dates = datesBetween(first, i.to);
  const tasks = i.tasks.filter((t) => t.date >= i.from && t.date <= i.to);
  const isDone = (t: PerformanceTask) => t.status === "completed" || t.doneByMe;
  const missedOf = (t: PerformanceTask) => !isDone(t) && isMissed({ kind: t.kind, status: t.status as never, dueAtMs: t.dueAtMs, date: t.date }, i.nowMs, i.today);

  const done = tasks.filter(isDone);
  const missed = tasks.filter(missedOf);
  const open = tasks.filter((t) => !isDone(t) && !missedOf(t));
  let onTime = 0;
  let late = 0;
  for (const t of tasks) {
    if (t.dueAtMs === null) continue;
    if (isDone(t)) {
      if (t.completedAtMs !== null && t.completedAtMs <= t.dueAtMs) onTime++;
      else if (t.completedAtMs !== null) late++;
    } else if (t.dueAtMs < i.nowMs) late++;
  }

  // Journal: only working days that have started count.
  const journalDays: { date: string; filled: number; expected: number }[] = [];
  if (i.business) {
    const hours = effectiveHours(i.person, i.business);
    const keys = workSlots(hours.start, hours.end);
    const docs = new Map(i.journals.map((j) => [j.date, j.slots]));
    for (const d of dates) {
      if (Date.parse(`${d}T00:00:00+05:00`) > i.nowMs) continue;
      if (!isWorkingDay(i.business.workDays, d) || isClosedFor(d, i.business.id, i.closed)) continue;
      const stats = fillStats(docs.get(d), keys);
      journalDays.push({ date: d, filled: stats.filled, expected: stats.expected });
    }
  }
  const filled = journalDays.reduce((s, d) => s + d.filled, 0);
  const expected = journalDays.reduce((s, d) => s + d.expected, 0);

  const seen = new Map(i.presence.map((p) => [p.date, p]));
  const attendanceDays = dates.map((date) => {
    const p = seen.get(date);
    const result = attendanceForDay({
      date,
      today: i.today,
      nowMs: i.nowMs,
      working: !!i.business && isWorkingDay(i.business.workDays, date) && !isClosedFor(date, i.business.id, i.closed),
      hours: i.business ? effectiveHours(i.person, i.business) : { start: "09:00", end: "18:00" },
      presence: p ? { firstSeenMs: p.firstSeenMs, lastSeenMs: p.lastSeenMs, activeSec: p.activeSec, idleSec: p.idleSec, breakSec: p.breakSec } : null,
      leave: i.away.some((r) => r.kind === "leave" && r.fromDate <= date && date <= r.toDate),
      excuse: i.away.some((r) => r.kind === "excuse" && r.fromDate === date),
    });
    return { date, result };
  });

  const inRange = i.presence.filter((p) => p.date >= i.from && p.date <= i.to);
  const activeSec = inRange.reduce((s, p) => s + p.activeSec, 0);
  const daysSeen = inRange.filter((p) => p.activeSec + p.idleSec + p.breakSec > 0).length;

  return {
    tasks: {
      assigned: tasks.length,
      done: done.length,
      open: open.length,
      blocked: tasks.filter((t) => t.status === "blocked").length,
      notDone: missed.length,
      notDoneWithReason: missed.filter((t) => !!t.missedReason).length,
      onTime,
      late,
      donePct: pct(done.length, tasks.length),
      onTimePct: pct(onTime, onTime + late),
    },
    done: done.sort((a, b) => (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0)),
    open: open.sort((a, b) => (a.dueAtMs ?? Infinity) - (b.dueAtMs ?? Infinity) || a.date.localeCompare(b.date)),
    missed: missed.sort((a, b) => b.date.localeCompare(a.date) || (b.dueAtMs ?? 0) - (a.dueAtMs ?? 0)),
    journal: { filled, expected, pct: pct(filled, expected), days: journalDays },
    attendance: { ...summarize(attendanceDays.map((d) => d.result), minuteOfDay), days: attendanceDays },
    presence: {
      activeSec,
      idleSec: inRange.reduce((s, p) => s + p.idleSec, 0),
      breakSec: inRange.reduce((s, p) => s + p.breakSec, 0),
      daysSeen,
      avgActiveSec: daysSeen ? Math.round(activeSec / daysSeen) : 0,
    },
  };
}

export type TeamInput = {
  from: string;
  to: string;
  today: string;
  nowMs: number;
  people: { id: string; name: string; businessId: string | null; workStart: string | null; workEnd: string | null; joinedOn?: string }[];
  businesses: { id: string; name: string; workDays: number[]; workStart: string; workEnd: string }[];
  tasks: (Omit<PerformanceTask, "doneByMe"> & { assigneeIds: string[]; doneBy: string[]; businessId: string })[];
  journals: { employeeId: string; date: string; slots: Slots }[];
  presence: { employeeId: string; date: string; activeSec: number; idleSec: number; breakSec: number; firstSeenMs: number; lastSeenMs: number }[];
  /** Approved leave and excuses for anyone. */
  away: (AwayRequest & { employeeId: string })[];
  closed: { date: string; businessId: string | null }[];
};

export type PersonReport = { person: TeamInput["people"][number]; business: TeamInput["businesses"][number] | null; report: PerformanceReport };

/** The same report for each person in the list, so the reports page can compare people on every measure. */
export function buildTeamReports(i: TeamInput): PersonReport[] {
  const businesses = new Map(i.businesses.map((b) => [b.id, b]));
  return i.people.map((person) => {
    const business = person.businessId ? (businesses.get(person.businessId) ?? null) : null;
    const report = buildPerformance({
      from: i.from,
      to: i.to,
      today: i.today,
      nowMs: i.nowMs,
      person,
      business,
      tasks: i.tasks.filter((t) => t.assigneeIds.includes(person.id)).map((t) => ({
          id: t.id, title: t.title, kind: t.kind, date: t.date, status: t.status, priority: t.priority, dueAtMs: t.dueAtMs, completedAtMs: t.completedAtMs,
          blockedReason: t.blockedReason, missedReason: t.missedReason, doneByMe: t.doneBy.includes(person.id),
        })),
      journals: i.journals.filter((j) => j.employeeId === person.id),
      presence: i.presence.filter((p) => p.employeeId === person.id),
      away: i.away.filter((r) => r.employeeId === person.id),
      closed: i.closed,
    });
    return { person, business, report };
  });
}
