import { describe, expect, it } from "vitest";
import { computeStreak, type StreakTask } from "@/lib/domain/streaks";
import { pktInstant } from "@/lib/time";

const today = "2026-11-18"; // a Wednesday
const nowMs = pktInstant(today, "12:00").getTime();
const all = [1, 2, 3, 4, 5, 6, 7];
const weekdays = [1, 2, 3, 4, 5];

const clean = (date: string, over: Partial<StreakTask> = {}): StreakTask => ({ date, status: "completed", doneByMe: true, dueAtMs: pktInstant(date, "17:00").getTime(), completedAtMs: pktInstant(date, "16:00").getTime(), ...over });
const late = (date: string): StreakTask => clean(date, { completedAtMs: pktInstant(date, "18:00").getTime() });
const open = (date: string, dueAtMs: number | null): StreakTask => ({ date, status: "todo", doneByMe: false, dueAtMs, completedAtMs: null });
const run = (tasks: StreakTask[], workDays = all) => computeStreak({ tasks, today, workDays, nowMs });

describe("computeStreak", () => {
  it("counts days in a row with every task finished on time", () => {
    expect(run([clean("2026-11-17"), clean("2026-11-16"), clean("2026-11-15")])).toEqual({ current: 3, best: 3 });
  });

  it("is broken by a past day with a late or unfinished task", () => {
    expect(run([clean("2026-11-17"), late("2026-11-16"), clean("2026-11-15")])).toEqual({ current: 1, best: 1 });
    expect(run([clean("2026-11-17"), open("2026-11-16", pktInstant("2026-11-16", "17:00").getTime())])).toEqual({ current: 1, best: 1 });
  });

  it("remembers the best run even after it was broken", () => {
    const tasks = [clean("2026-11-17"), late("2026-11-16"), clean("2026-11-15"), clean("2026-11-14"), clean("2026-11-13")];
    expect(run(tasks)).toEqual({ current: 1, best: 3 });
  });

  it("does not break on days with no tasks, or on days off", () => {
    // Fri 13 and Mon 16 have work; the weekend between has none and is a day off anyway.
    expect(run([clean("2026-11-16"), clean("2026-11-13")], weekdays)).toEqual({ current: 2, best: 2 });
    expect(run([clean("2026-11-17"), clean("2026-11-15")])).toEqual({ current: 2, best: 2 });
  });

  it("does not break today while work is still on time, but does once something is already late", () => {
    expect(run([clean("2026-11-17"), open(today, pktInstant(today, "17:00").getTime())])).toEqual({ current: 1, best: 1 });
    expect(run([clean("2026-11-17"), open(today, pktInstant(today, "09:00").getTime())])).toEqual({ current: 0, best: 1 });
  });

  it("adds today once everything for it is finished on time", () => {
    expect(run([clean("2026-11-17"), clean(today)])).toEqual({ current: 2, best: 2 });
  });

  it("treats a task with no time as on time when finished on its own day, and late after", () => {
    const noTime = (date: string, doneAt: string) => ({ date, status: "completed", doneByMe: true, dueAtMs: null, completedAtMs: pktInstant(doneAt, "10:00").getTime() });
    expect(run([noTime("2026-11-17", "2026-11-17")]).current).toBe(1);
    expect(run([noTime("2026-11-17", "2026-11-18")]).current).toBe(0);
  });

  it("counts your own tick on a shared task", () => {
    expect(run([clean("2026-11-17", { status: "in_progress", doneByMe: true })]).current).toBe(1);
  });

  it("is zero with nothing to go on", () => {
    expect(run([])).toEqual({ current: 0, best: 0 });
  });
});
