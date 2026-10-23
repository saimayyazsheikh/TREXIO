import { describe, expect, it } from "vitest";
import {
  MAX_LEAVE_DAYS, assertValidLeave, breakActionSchema, calendarEntrySchema, calendarId, daysBetween, fixedHolidays, isClosedFor, leaveActionSchema, leaveCoversDate,
  type NewLeave,
} from "@/lib/domain/timeoff";

const today = "2026-10-21";
const leave = (over: Record<string, unknown> = {}): NewLeave =>
  leaveActionSchema.parse({ action: "create", kind: "leave", fromDate: "2026-10-22", toDate: "2026-10-23", reason: "Family wedding", ...over }) as NewLeave;

describe("schemas", () => {
  it("parses breaks and defaults the note", () => {
    expect(breakActionSchema.parse({ action: "start", type: "namaz" })).toEqual({ action: "start", type: "namaz", note: "" });
    expect(breakActionSchema.safeParse({ action: "start", type: "nap" }).success).toBe(false);
    expect(breakActionSchema.safeParse({ action: "end" }).success).toBe(true);
  });
  it("turns empty times into null and needs a real reason", () => {
    const parsed = leave();
    expect(parsed).toMatchObject({ fromTime: null, toTime: null });
    expect(leaveActionSchema.safeParse({ action: "create", kind: "leave", fromDate: "2026-10-22", toDate: "2026-10-22", reason: "ok" }).success).toBe(false);
    expect(leaveActionSchema.safeParse({ action: "decide", requestId: "r1", decision: "maybe" }).success).toBe(false);
  });
});

describe("assertValidLeave", () => {
  it("accepts a normal leave and a normal excuse", () => {
    expect(() => assertValidLeave(leave(), today)).not.toThrow();
    expect(() => assertValidLeave(leave({ kind: "excuse", fromDate: "2026-10-22", toDate: "2026-10-22", fromTime: "14:00", toTime: "16:00" }), today)).not.toThrow();
  });
  it("rejects a backwards range, too-old starts and over-long leave", () => {
    expect(() => assertValidLeave(leave({ fromDate: "2026-10-25", toDate: "2026-10-24" }), today)).toThrow(/before the start/);
    expect(() => assertValidLeave(leave({ fromDate: "2026-10-13", toDate: "2026-10-14" }), today)).toThrow(/at most 7 days ago/);
    expect(() => assertValidLeave(leave({ fromDate: "2026-10-14", toDate: "2026-10-15" }), today)).not.toThrow();
    expect(() => assertValidLeave(leave({ fromDate: "2026-10-22", toDate: "2027-01-30" }), today)).toThrow(new RegExp(`${MAX_LEAVE_DAYS} days`));
  });
  it("leave is whole days; an excuse is one day with a start and an end", () => {
    expect(() => assertValidLeave(leave({ fromTime: "09:00", toTime: "12:00" }), today)).toThrow(/whole days/);
    const excuse = { kind: "excuse", fromDate: "2026-10-22", toDate: "2026-10-22" };
    expect(() => assertValidLeave(leave({ ...excuse, toDate: "2026-10-23", fromTime: "09:00", toTime: "10:00" }), today)).toThrow(/single day/);
    expect(() => assertValidLeave(leave(excuse), today)).toThrow(/start and end time/);
    expect(() => assertValidLeave(leave({ ...excuse, fromTime: "16:00", toTime: "15:00" }), today)).toThrow(/end after it starts/);
  });
});

describe("leaveCoversDate", () => {
  const l = { kind: "leave" as const, status: "approved" as const, fromDate: "2026-10-22", toDate: "2026-10-24" };
  it("covers every date in an approved leave, inclusive", () => {
    expect(["2026-10-21", "2026-10-22", "2026-10-24", "2026-10-25"].map((d) => leaveCoversDate(l, d))).toEqual([false, true, true, false]);
  });
  it("only approved whole-day leave counts", () => {
    for (const status of ["pending", "rejected", "cancelled"] as const) expect(leaveCoversDate({ ...l, status }, "2026-10-23")).toBe(false);
    expect(leaveCoversDate({ ...l, kind: "excuse" }, "2026-10-23")).toBe(false);
  });
  it("daysBetween is inclusive across month ends", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(4);
    expect(daysBetween("2026-10-22", "2026-10-22")).toBe(1);
  });
});

describe("calendar", () => {
  it("one id per date and scope", () => {
    expect(calendarId("2026-08-14", null)).toBe("2026-08-14_all");
    expect(calendarId("2026-08-14", "b1")).toBe("2026-08-14_b1");
  });
  it("validates entries", () => {
    expect(calendarEntrySchema.safeParse({ date: "2026-08-14", name: "Independence Day", businessId: null }).success).toBe(true);
    expect(calendarEntrySchema.safeParse({ date: "14-08-2026", name: "Independence Day", businessId: null }).success).toBe(false);
    expect(calendarEntrySchema.safeParse({ date: "2026-08-14", name: "x", businessId: null }).success).toBe(false);
  });
  it("a holiday closes every business; a closure only its own", () => {
    const entries = [{ date: "2026-08-14", businessId: null }, { date: "2026-10-30", businessId: "b1" }];
    expect(isClosedFor("2026-08-14", "b1", entries)).toBe(true);
    expect(isClosedFor("2026-08-14", "b2", entries)).toBe(true);
    expect(isClosedFor("2026-10-30", "b1", entries)).toBe(true);
    expect(isClosedFor("2026-10-30", "b2", entries)).toBe(false);
    expect(isClosedFor("2026-10-31", "b1", entries)).toBe(false);
  });
  it("seeds only the fixed national days for a year", () => {
    expect(fixedHolidays(2027).map((h) => h.date)).toEqual(["2027-03-23", "2027-05-01", "2027-08-14", "2027-12-25"]);
    expect(fixedHolidays(2027).every((h) => h.businessId === null)).toBe(true);
  });
});
