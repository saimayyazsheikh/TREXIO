import { describe, expect, it } from "vitest";
import {
  MAX_SLOT_TASKS, addTaskToSlot, effectiveHours, fillStats, hourKey, isWorkingDay, journalId, promptDue, removeTaskFromSlot, slotFilled, slotLabel, workSlots,
} from "@/lib/domain/journal";

describe("workSlots", () => {
  it("covers each started hour of the working window", () => {
    expect(workSlots("09:00", "18:00")).toEqual(["09", "10", "11", "12", "13", "14", "15", "16", "17"]);
    expect(workSlots("09:30", "17:15")).toEqual(["09", "10", "11", "12", "13", "14", "15", "16", "17"]);
    expect(workSlots("08:00", "09:00")).toEqual(["08"]);
  });
  it("never returns an empty list, even for a zero-length window", () => {
    expect(workSlots("08:00", "08:00")).toEqual(["08"]);
  });
  it("handles early and late shifts", () => {
    expect(workSlots("00:00", "03:00")).toEqual(["00", "01", "02"]);
    expect(workSlots("21:00", "23:59")).toEqual(["21", "22", "23"]);
  });
});

describe("effectiveHours", () => {
  const business = { workStart: "09:00", workEnd: "18:00" };
  it("uses the employee's own hours when both are set, otherwise the business's", () => {
    expect(effectiveHours({ workStart: "10:00", workEnd: "19:00" }, business)).toEqual({ start: "10:00", end: "19:00" });
    expect(effectiveHours({ workStart: null, workEnd: null }, business)).toEqual({ start: "09:00", end: "18:00" });
    expect(effectiveHours({ workStart: "10:00", workEnd: null }, business)).toEqual({ start: "09:00", end: "18:00" });
  });
});

describe("labels, ids and working days", () => {
  it("formats slot labels in 12-hour time", () => {
    expect(slotLabel("00")).toBe("12 AM to 1 AM");
    expect(slotLabel("09")).toBe("9 AM to 10 AM");
    expect(slotLabel("11")).toBe("11 AM to 12 PM");
    expect(slotLabel("12")).toBe("12 PM to 1 PM");
    expect(slotLabel("23")).toBe("11 PM to 12 AM");
  });
  it("pads hour keys and builds the document id", () => {
    expect(hourKey(7)).toBe("07");
    expect(journalId("abc", "2026-10-21")).toBe("abc_2026-10-21");
  });
  it("knows working days by ISO weekday", () => {
    expect(isWorkingDay([1, 2, 3, 4, 5], "2026-10-21")).toBe(true); // Wednesday
    expect(isWorkingDay([1, 2, 3, 4, 5], "2026-10-24")).toBe(false); // Saturday
  });
});

describe("fill rate", () => {
  const expected = ["09", "10", "11", "12"];
  it("counts slots with text or tasks, ignoring blanks and slots outside working hours", () => {
    const stats = fillStats({ "09": { text: "Opened shop", taskIds: [] }, "10": { text: "   ", taskIds: [] }, "11": { text: "", taskIds: ["t1"] }, "20": { text: "Overtime", taskIds: [] } }, expected);
    expect(stats).toEqual({ filled: 2, expected: 4, pct: 50 });
  });
  it("handles an empty or missing journal and no expected slots", () => {
    expect(fillStats(undefined, expected)).toEqual({ filled: 0, expected: 4, pct: 0 });
    expect(fillStats({}, [])).toEqual({ filled: 0, expected: 0, pct: 0 });
  });
  it("slotFilled", () => {
    expect(slotFilled(undefined)).toBe(false);
    expect(slotFilled({ text: " ", taskIds: [] })).toBe(false);
    expect(slotFilled({ text: "x", taskIds: [] })).toBe(true);
    expect(slotFilled({ text: "", taskIds: ["a"] })).toBe(true);
  });
});

describe("promptDue (the :55 prompt)", () => {
  const expected = workSlots("09:00", "18:00");
  const at = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00+05:00`);
  const base = { expected, slots: undefined, handled: new Set<string>(), snoozedUntilMs: null };

  it("fires from minute 55 of a working hour when that hour is empty", () => {
    expect(promptDue(at("10:54"), base)).toBeNull();
    expect(promptDue(at("10:55"), base)).toBe("10");
    expect(promptDue(at("10:59"), base)).toBe("10");
  });
  it("stays quiet outside working hours", () => {
    expect(promptDue(at("08:55"), base)).toBeNull();
    expect(promptDue(at("18:55"), base)).toBeNull();
    expect(promptDue(at("17:55"), base)).toBe("17");
  });
  it("stays quiet when the hour already has an entry, or was handled", () => {
    expect(promptDue(at("10:56"), { ...base, slots: { "10": { text: "Did the audit", taskIds: [] } } })).toBeNull();
    expect(promptDue(at("10:56"), { ...base, handled: new Set(["2026-10-21-10"]) })).toBeNull();
    expect(promptDue(at("11:56"), { ...base, handled: new Set(["2026-10-21-10"]) })).toBe("11");
  });
  it("respects a snooze, then asks again, and honours a custom minute", () => {
    expect(promptDue(at("10:56"), { ...base, snoozedUntilMs: at("10:58").getTime() })).toBeNull();
    expect(promptDue(at("10:58"), { ...base, snoozedUntilMs: at("10:58").getTime() })).toBe("10");
    expect(promptDue(at("10:56"), { ...base, promptMinute: 56 })).toBe("10");
    expect(promptDue(at("10:55"), { ...base, promptMinute: 56 })).toBeNull();
  });
});

describe("task chips in a slot", () => {
  it("adds without duplicates and creates the slot if needed", () => {
    const s = addTaskToSlot(undefined, "t1");
    expect(s).toEqual({ text: "", taskIds: ["t1"] });
    expect(addTaskToSlot(s, "t1")).toBe(s);
    expect(addTaskToSlot(s, "t2").taskIds).toEqual(["t1", "t2"]);
  });
  it("respects the per-slot cap and can remove", () => {
    const full = { text: "", taskIds: Array.from({ length: MAX_SLOT_TASKS }, (_, i) => `t${i}`) };
    expect(addTaskToSlot(full, "extra")).toBe(full);
    expect(removeTaskFromSlot({ text: "x", taskIds: ["a", "b"] }, "a")).toEqual({ text: "x", taskIds: ["b"] });
  });
});
