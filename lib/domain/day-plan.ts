import { pktInstant } from "@/lib/time";

export type PlanItem = { id: string; title: string; dueMs: number | null; state: "done" | "missed" | "open" };
export type PlanWindow = {
  /** The shared due time of everything in this window. */
  endMs: number;
  /** The previous deadline (or the start of the working day): the time there is to get this done. */
  startMs: number;
  items: PlanItem[];
  state: "done" | "missed" | "now" | "open";
};
export type DayPlan = { startMs: number; endMs: number; windows: PlanWindow[]; untimed: PlanItem[] };

const HOUR = 3_600_000;
const MIN_WINDOW = 10 * 60_000;

/**
 * Lays a person's daily routines along their working day. Each routine gets the stretch of time that ends at its deadline,
 * so the picture answers "how long do I have for this one?". Routines with no time are listed separately.
 */
export function buildDayPlan(items: PlanItem[], hours: { start: string; end: string }, date: string, nowMs: number): DayPlan {
  const midnight = pktInstant(date, "00:00").getTime();
  const dayStart = pktInstant(date, hours.start).getTime();
  const dayEnd = pktInstant(date, hours.end).getTime();
  const timed = items.filter((i) => i.dueMs !== null).sort((a, b) => a.dueMs! - b.dueMs!);
  const untimed = items.filter((i) => i.dueMs === null);

  // The day covers the working hours, stretched to whole hours when a deadline falls outside them.
  const earliest = timed[0]?.dueMs ?? dayStart;
  const latest = timed.at(-1)?.dueMs ?? dayEnd;
  const startMs = Math.max(midnight, Math.min(dayStart, midnight + Math.floor((earliest - midnight) / HOUR) * HOUR));
  const endMs = Math.min(midnight + 24 * HOUR, Math.max(dayEnd, midnight + Math.ceil((latest - midnight) / HOUR) * HOUR));

  const groups = new Map<number, PlanItem[]>();
  for (const i of timed) groups.set(i.dueMs!, [...(groups.get(i.dueMs!) ?? []), i]);

  const windows: PlanWindow[] = [];
  let prev = startMs;
  for (const [due, group] of groups) {
    const start = due - prev < MIN_WINDOW ? Math.max(startMs, due - MIN_WINDOW) : prev;
    const state: PlanWindow["state"] = group.every((g) => g.state === "done") ? "done" : group.some((g) => g.state === "missed") ? "missed" : nowMs >= start && nowMs <= due ? "now" : "open";
    windows.push({ startMs: start, endMs: due, items: group, state });
    prev = due;
  }
  return { startMs, endMs, windows, untimed };
}

/** Where a moment sits along the day, 0 to 1 (clamped). */
export const fractionOfDay = (plan: Pick<DayPlan, "startMs" | "endMs">, ms: number) => Math.min(1, Math.max(0, (ms - plan.startMs) / (plan.endMs - plan.startMs)));
