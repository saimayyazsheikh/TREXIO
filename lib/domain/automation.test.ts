import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, briefingText, escalationDue, lateBy, nudgeDefault, resolveSettings, settingsSchema } from "@/lib/domain/automation";

const MIN = 60_000;
const S = { escalationL1Min: 60, escalationL2Min: 180 };
const task = (o: Partial<Parameters<typeof escalationDue>[0]> = {}) => ({ status: "todo", dueAtMs: 0, escalation: { l1At: null, l2At: null }, ...o });

describe("escalationDue", () => {
  it("does nothing before the first threshold", () => expect(escalationDue(task(), 59 * MIN, S)).toEqual({ l1: false, l2: false }));
  it("fires level 1 at one hour late", () => expect(escalationDue(task(), 60 * MIN, S)).toEqual({ l1: true, l2: false }));
  it("fires both when a long-late task is first seen", () => expect(escalationDue(task(), 200 * MIN, S)).toEqual({ l1: true, l2: true }));
  it("never fires a level twice", () => {
    expect(escalationDue(task({ escalation: { l1At: new Date(), l2At: null } }), 200 * MIN, S)).toEqual({ l1: false, l2: true });
    expect(escalationDue(task({ escalation: { l1At: new Date(), l2At: new Date() } }), 200 * MIN, S)).toEqual({ l1: false, l2: false });
  });
  it("only escalates tasks that are To-Do or In Progress", () => {
    for (const status of ["completed", "blocked", "under_review"]) expect(escalationDue(task({ status }), 500 * MIN, S)).toEqual({ l1: false, l2: false });
    expect(escalationDue(task({ status: "in_progress" }), 70 * MIN, S).l1).toBe(true);
  });
  it("ignores tasks with no due time, tasks not yet due, and tasks abandoned for days", () => {
    expect(escalationDue(task({ dueAtMs: null }), 500 * MIN, S)).toEqual({ l1: false, l2: false });
    expect(escalationDue(task({ dueAtMs: 10 * MIN }), 5 * MIN, S)).toEqual({ l1: false, l2: false });
    expect(escalationDue(task(), 49 * 60 * MIN, S)).toEqual({ l1: false, l2: false });
  });
  it("respects custom thresholds", () => expect(escalationDue(task(), 30 * MIN, { escalationL1Min: 30, escalationL2Min: 90 }).l1).toBe(true));
});

describe("settings", () => {
  it("defaults are valid", () => expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true));
  it("requires the second alert after the first", () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, escalationL1Min: 120, escalationL2Min: 90 }).success).toBe(false);
  });
  it("resolveSettings fills gaps and repairs bad values", () => {
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings({ idleMin: 10 })).toEqual({ ...DEFAULT_SETTINGS, idleMin: 10 });
    expect(resolveSettings({ idleMin: 999, promptMinute: 50 })).toEqual({ ...DEFAULT_SETTINGS, promptMinute: 50 });
    expect(resolveSettings({ escalationL1Min: 200, escalationL2Min: 100 })).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings({ briefingEnabled: "yes" }).briefingEnabled).toBe(true);
  });
});

describe("messages", () => {
  it("lateBy reads naturally", () => {
    expect(lateBy(0, 45 * MIN)).toBe("45 min");
    expect(lateBy(0, 60 * MIN)).toBe("1h");
    expect(lateBy(0, 135 * MIN)).toBe("2h 15m");
  });
  it("nudge greets by first name and names the task", () => {
    const text = nudgeDefault({ employeeName: "Ali Khan", title: "Cash up", dueAtMs: null, status: "In Progress" });
    expect(text).toContain("Hi Ali");
    expect(text).toContain("Cash up");
  });
  it("briefing lists the tasks, caps long lists, and handles an empty day", () => {
    expect(briefingText("Sara Ahmed", [])).toContain("nothing assigned");
    const many = Array.from({ length: 15 }, (_, i) => ({ title: `T${i}`, dueAtMs: null }));
    const text = briefingText("Sara Ahmed", many);
    expect(text).toContain("15 tasks");
    expect(text).toContain("…and 3 more");
    expect(briefingText("Sara", [{ title: "One", dueAtMs: null }])).toContain("1 task:");
  });
});
