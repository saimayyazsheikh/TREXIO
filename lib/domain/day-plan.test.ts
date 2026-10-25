import { describe, expect, it } from "vitest";
import { buildDayPlan, fractionOfDay, type PlanItem } from "@/lib/domain/day-plan";
import { pktInstant } from "@/lib/time";

const date = "2026-10-21";
const at = (hhmm: string) => pktInstant(date, hhmm).getTime();
const item = (id: string, due: string | null, state: PlanItem["state"] = "open"): PlanItem => ({ id, title: id, dueMs: due ? at(due) : null, state });
const hours = { start: "09:00", end: "18:00" };

describe("buildDayPlan", () => {
  it("gives each routine the time from the previous deadline to its own", () => {
    const plan = buildDayPlan([item("cash", "17:45"), item("open", "09:30"), item("stock", "13:00")], hours, date, at("08:00"));
    expect(plan.windows.map((w) => [w.items[0].id, w.startMs, w.endMs])).toEqual([
      ["open", at("09:00"), at("09:30")],
      ["stock", at("09:30"), at("13:00")],
      ["cash", at("13:00"), at("17:45")],
    ]);
    expect([plan.startMs, plan.endMs]).toEqual([at("09:00"), at("18:00")]);
  });

  it("groups routines that share a deadline, and lists untimed ones apart", () => {
    const plan = buildDayPlan([item("a", "12:00"), item("b", "12:00"), item("c", null)], hours, date, at("08:00"));
    expect(plan.windows).toHaveLength(1);
    expect(plan.windows[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(plan.untimed.map((i) => i.id)).toEqual(["c"]);
  });

  it("marks the window you are in, and shows done and missed ones", () => {
    const items = [item("done", "10:00", "done"), item("late", "11:00", "missed"), item("now", "14:00"), item("later", "17:00")];
    const states = buildDayPlan(items, hours, date, at("13:00")).windows.map((w) => w.state);
    expect(states).toEqual(["done", "missed", "now", "open"]);
  });

  it("stretches the day to whole hours when a deadline falls outside the working hours", () => {
    const plan = buildDayPlan([item("early", "07:30"), item("late", "19:15")], hours, date, at("08:00"));
    expect([plan.startMs, plan.endMs]).toEqual([at("07:00"), at("20:00")]);
  });

  it("widens back-to-back deadlines so each window stays visible, without leaving the day", () => {
    const plan = buildDayPlan([item("a", "12:00"), item("b", "12:03")], hours, date, at("08:00"));
    const second = plan.windows[1];
    expect(second.endMs - second.startMs).toBe(10 * 60_000);
    expect(second.startMs).toBeGreaterThanOrEqual(plan.startMs);
  });

  it("places a moment along the day", () => {
    const plan = buildDayPlan([], hours, date, at("08:00"));
    expect(fractionOfDay(plan, at("13:30"))).toBe(0.5);
    expect(fractionOfDay(plan, at("07:00"))).toBe(0);
    expect(fractionOfDay(plan, at("23:00"))).toBe(1);
  });
});
