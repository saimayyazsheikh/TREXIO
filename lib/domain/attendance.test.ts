import { describe, expect, it } from "vitest";
import { attendanceForDay, awayAt, excusedSeconds, summarize, type DayInput } from "@/lib/domain/attendance";
import { pktInstant } from "@/lib/time";

const day = "2026-10-21"; // a Wednesday
const at = (hhmm: string) => pktInstant(day, hhmm).getTime();
const base = (o: Partial<DayInput> = {}): DayInput => ({
  date: day,
  today: "2026-10-23",
  nowMs: at("23:00") + 2 * 86_400_000,
  working: true,
  hours: { start: "09:00", end: "18:00" },
  presence: null,
  leave: false,
  excuse: false,
  ...o,
});
const seen = (first: string, last = "17:30") => ({ firstSeenMs: at(first), lastSeenMs: at(last), activeSec: 3600, idleSec: 600, breakSec: 0 });

describe("attendanceForDay", () => {
  it("counts someone seen by the start of the day as present", () => {
    const r = attendanceForDay(base({ presence: seen("08:58") }));
    expect(r).toMatchObject({ status: "present", lateMin: 0, checkInMs: at("08:58"), checkOutMs: at("17:30") });
  });
  it("allows the grace period, then counts late with how many minutes", () => {
    expect(attendanceForDay(base({ presence: seen("09:15") })).status).toBe("present");
    expect(attendanceForDay(base({ presence: seen("09:40") }))).toMatchObject({ status: "late", lateMin: 40 });
  });
  it("is absent when nobody was seen on a working day, unless leave or an excuse covers it", () => {
    expect(attendanceForDay(base()).status).toBe("absent");
    expect(attendanceForDay(base({ excuse: true })).status).toBe("excused");
    expect(attendanceForDay(base({ leave: true })).status).toBe("leave");
  });
  it("leaves days off and days still to come out of the count", () => {
    expect(attendanceForDay(base({ working: false })).status).toBe("off");
    expect(attendanceForDay(base({ date: "2026-10-30" })).status).toBe("upcoming");
  });
  it("does not call someone absent before the working day has really begun", () => {
    const today = "2026-10-23";
    const start = pktInstant(today, "09:00").getTime();
    expect(attendanceForDay(base({ date: today, today, nowMs: start + 5 * 60_000 })).status).toBe("upcoming");
    expect(attendanceForDay(base({ date: today, today, nowMs: start + 2 * 3_600_000 })).status).toBe("absent");
  });
  it("does not hold days before someone was added against them", () => {
    expect(attendanceForDay(base({ joined: "2026-10-22" })).status).toBe("before");
    expect(attendanceForDay(base({ joined: "2026-10-21" })).status).toBe("absent");
  });
  it("keeps the times for a day off when the person came in anyway", () => {
    expect(attendanceForDay(base({ working: false, presence: seen("10:00") }))).toMatchObject({ status: "off", checkInMs: at("10:00") });
  });
});

describe("approved leave and excuses", () => {
  const excuse = { kind: "excuse" as const, fromDate: day, toDate: day, fromTime: "13:00", toTime: "14:30" };
  const leave = { kind: "leave" as const, fromDate: "2026-10-20", toDate: "2026-10-22", fromTime: null, toTime: null };
  it("finds an excuse only inside its window", () => {
    expect(awayAt([excuse], at("12:59"))).toBeNull();
    expect(awayAt([excuse], at("13:00"))).toBe("excuse");
    expect(awayAt([excuse], at("14:29"))).toBe("excuse");
    expect(awayAt([excuse], at("14:30"))).toBeNull();
  });
  it("finds leave for every moment of its days, and puts leave ahead of an excuse", () => {
    expect(awayAt([leave], at("03:00"))).toBe("leave");
    expect(awayAt([excuse, leave], at("13:30"))).toBe("leave");
    expect(awayAt([leave], pktInstant("2026-10-23", "10:00").getTime())).toBeNull();
  });
  it("adds up the excused time on a date", () => {
    expect(excusedSeconds([excuse, { ...excuse, fromTime: "16:00", toTime: "16:30" }], day)).toBe(90 * 60 + 30 * 60);
    expect(excusedSeconds([excuse], "2026-10-22")).toBe(0);
  });
});

describe("summarize", () => {
  it("counts each kind and averages the arrival time", () => {
    const days = [
      attendanceForDay(base({ presence: seen("09:00") })),
      attendanceForDay(base({ presence: seen("10:00") })),
      attendanceForDay(base()),
      attendanceForDay(base({ leave: true })),
      attendanceForDay(base({ working: false })),
    ];
    const s = summarize(days, (ms) => Math.round((ms - pktInstant(day, "00:00").getTime()) / 60_000));
    expect(s).toEqual({ present: 1, late: 1, absent: 1, leave: 1, excused: 0, avgCheckInMin: 570 });
  });
});
