import { dateStringFromDayIndex, dayIndexFromDateString, isoWeekdayOfDate, pktDayBounds } from "@/lib/time";

export type StreakTask = {
  date: string;
  status: string;
  /** This person has ticked their own part (or the whole task is completed). */
  doneByMe: boolean;
  dueAtMs: number | null;
  completedAtMs: number | null;
};

export type Streak = { current: number; best: number };

/** How many days back the streak looks. */
export const STREAK_DAYS = 45;

type DayState = "clean" | "broken" | "pending" | "empty";

function finishedOnTime(t: StreakTask): boolean {
  if (!(t.status === "completed" || t.doneByMe) || t.completedAtMs === null) return false;
  // With no time set, finishing any time on the task's own day counts.
  const limit = t.dueAtMs ?? pktDayBounds(t.date).end.getTime();
  return t.completedAtMs <= limit;
}

/**
 * Days in a row with every task finished on time. A day with no tasks, a day off, and today while things are still open don't
 * break a streak (they just don't add to it). A past day with anything late or unfinished does.
 */
export function computeStreak(i: { tasks: StreakTask[]; today: string; workDays: number[]; nowMs: number }): Streak {
  const byDay = new Map<string, StreakTask[]>();
  for (const t of i.tasks) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);

  const stateOf = (date: string): DayState => {
    const list = byDay.get(date) ?? [];
    if (list.length === 0) return "empty";
    if (list.every(finishedOnTime)) return "clean";
    // Today is not over: work still open and not yet past its time is fine, anything already late is not.
    if (date === i.today) {
      const open = (t: StreakTask) => !(t.status === "completed" || t.doneByMe) && (t.dueAtMs === null || t.dueAtMs >= i.nowMs);
      return list.every((t) => finishedOnTime(t) || open(t)) ? "pending" : "broken";
    }
    return "broken";
  };

  const end = dayIndexFromDateString(i.today);
  let current = 0;
  let best = 0;
  let run = 0;
  let stillCurrent = true;
  // Newest to oldest: the first break ends the current streak; the best is the longest run anywhere in the window.
  for (let n = 0; n < STREAK_DAYS; n++) {
    const date = dateStringFromDayIndex(end - n);
    if (!i.workDays.includes(isoWeekdayOfDate(date))) continue;
    const state = stateOf(date);
    if (state === "clean") {
      run++;
      best = Math.max(best, run);
      if (stillCurrent) current = run;
    } else if (state === "broken") {
      stillCurrent = false;
      run = 0;
    }
    // "empty" and "pending" neither add nor break.
  }
  return { current, best };
}
