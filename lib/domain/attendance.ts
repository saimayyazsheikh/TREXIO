import { pktDateString, pktInstant } from "@/lib/time";

/** How a person's day counts. "off" is a day nobody is expected (weekend, holiday, closure). */
export type DayStatus = "present" | "late" | "absent" | "leave" | "excused" | "off" | "upcoming" | "before";

/** Minutes after the start of the working day that still count as on time. */
export const LATE_GRACE_MIN = 15;

/** An approved leave request or short excuse, as far as attendance cares. */
export type AwayRequest = { kind: "leave" | "excuse"; fromDate: string; toDate: string; fromTime: string | null; toTime: string | null };

/** What an approved request means right now: a day of leave, a short excuse in progress, or nothing. */
export function awayAt(requests: AwayRequest[], nowMs: number): "leave" | "excuse" | null {
  const date = pktDateString(new Date(nowMs));
  if (requests.some((r) => r.kind === "leave" && r.fromDate <= date && date <= r.toDate)) return "leave";
  const inExcuse = requests.some((r) => {
    if (r.kind !== "excuse" || r.fromDate !== date || !r.fromTime || !r.toTime) return false;
    return nowMs >= pktInstant(date, r.fromTime).getTime() && nowMs < pktInstant(date, r.toTime).getTime();
  });
  return inExcuse ? "excuse" : null;
}

/** Seconds of approved short excuse on `date`. */
export function excusedSeconds(requests: AwayRequest[], date: string): number {
  let total = 0;
  for (const r of requests) {
    if (r.kind !== "excuse" || r.fromDate !== date || !r.fromTime || !r.toTime) continue;
    total += Math.max(0, (pktInstant(date, r.toTime).getTime() - pktInstant(date, r.fromTime).getTime()) / 1000);
  }
  return Math.round(total);
}

export type PresenceDay = { firstSeenMs: number; lastSeenMs: number; activeSec: number; idleSec: number; breakSec: number };

export type DayInput = {
  date: string;
  /** Today's date in Pakistan time, and the current instant. */
  today: string;
  nowMs: number;
  /** A working day for this person's business: right weekday and not a holiday or closure. */
  working: boolean;
  hours: { start: string; end: string };
  presence: PresenceDay | null;
  /** An approved whole day of leave covers this date. */
  leave: boolean;
  /** An approved short excuse is on this date. */
  excuse: boolean;
  graceMin?: number;
  /** The date this person was added. Days before it are not held against them. */
  joined?: string;
};

export type DayResult = { status: DayStatus; checkInMs: number | null; checkOutMs: number | null; lateMin: number; activeSec: number };

/**
 * Attendance from what Traxio already records: the first and last time someone was seen in the app that day
 * (their login and logout), the leave that was approved, and the business calendar.
 */
export function attendanceForDay(i: DayInput): DayResult {
  const seen = i.presence;
  const base = { checkInMs: seen?.firstSeenMs ?? null, checkOutMs: seen?.lastSeenMs ?? null, activeSec: seen?.activeSec ?? 0 };
  const startMs = pktInstant(i.date, i.hours.start).getTime();
  const grace = i.graceMin ?? LATE_GRACE_MIN;
  const lateMin = seen ? Math.max(0, Math.round((seen.firstSeenMs - startMs) / 60_000)) : 0;

  if (i.joined && i.date < i.joined) return { ...base, status: "before", lateMin: 0 };
  if (!i.working) return { ...base, status: "off", lateMin: 0 };
  if (i.leave) return { ...base, status: "leave", lateMin: 0 };
  if (seen) return { ...base, status: lateMin > grace ? "late" : "present", lateMin };
  if (i.date > i.today || (i.date === i.today && i.nowMs < startMs + grace * 60_000)) return { ...base, status: "upcoming", lateMin: 0 };
  return { ...base, status: i.excuse ? "excused" : "absent", lateMin: 0 };
}

export type MonthSummary = { present: number; late: number; absent: number; leave: number; excused: number; avgCheckInMin: number | null };

/** Counts for a run of days. Days off and days still to come are left out. Average check-in is minutes after midnight, Pakistan time. */
export function summarize(days: DayResult[], checkInMinuteOfDay: (ms: number) => number): MonthSummary {
  const out: MonthSummary = { present: 0, late: 0, absent: 0, leave: 0, excused: 0, avgCheckInMin: null };
  const arrivals: number[] = [];
  for (const d of days) {
    if (d.status === "present" || d.status === "late") {
      out[d.status]++;
      if (d.checkInMs !== null) arrivals.push(checkInMinuteOfDay(d.checkInMs));
    } else if (d.status === "absent" || d.status === "leave" || d.status === "excused") out[d.status]++;
  }
  if (arrivals.length) out.avgCheckInMin = Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length);
  return out;
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave: "On leave",
  excused: "Excused",
  off: "Day off",
  upcoming: "Not started",
  before: "Not added yet",
};
