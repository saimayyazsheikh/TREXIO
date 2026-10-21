import { describe, expect, it } from "vitest";
import {
  dateStringFromDayIndex,
  dayIndexFromDateString,
  pktDateString,
  pktDayBounds,
  pktDayIndex,
  pktHour,
  pktIsoWeekday,
} from "@/lib/time";

describe("PKT day boundaries", () => {
  it("rolls the PKT date at 19:00 UTC", () => {
    expect(pktDateString(new Date("2026-10-20T18:59:59Z"))).toBe("2026-10-20");
    expect(pktDateString(new Date("2026-10-20T19:00:00Z"))).toBe("2026-10-21");
  });

  it("day index changes exactly at PKT midnight", () => {
    const before = pktDayIndex(new Date("2026-10-20T18:59:59.999Z"));
    const after = pktDayIndex(new Date("2026-10-20T19:00:00.000Z"));
    expect(after - before).toBe(1);
  });

  it("converts between day index and date string", () => {
    const idx = dayIndexFromDateString("2026-10-21");
    expect(dateStringFromDayIndex(idx)).toBe("2026-10-21");
    expect(pktDayIndex(new Date("2026-10-21T10:00:00+05:00"))).toBe(idx);
  });

  it("returns UTC bounds of a PKT day", () => {
    const { start, end } = pktDayBounds("2026-10-21");
    expect(start.toISOString()).toBe("2026-10-20T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-21T19:00:00.000Z");
  });

  it("reads hour and ISO weekday in PKT", () => {
    const at = new Date("2026-10-21T04:00:00Z"); // Wednesday 09:00 PKT
    expect(pktHour(at)).toBe(9);
    expect(pktIsoWeekday(at)).toBe(3);
  });
});
