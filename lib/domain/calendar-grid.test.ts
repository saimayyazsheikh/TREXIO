import { describe, expect, it } from "vitest";
import { addMonths, monthGrid, monthRange, monthStart } from "@/lib/domain/calendar-grid";

describe("calendar grid", () => {
  it("finds the month a date is in, and moves between months across a year end", () => {
    expect(monthStart("2026-11-18")).toBe("2026-11-01");
    expect(addMonths("2026-11-01", 1)).toBe("2026-12-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-03-01", -14)).toBe("2025-01-01");
  });

  it("knows the first and last day, including a leap February", () => {
    expect(monthRange("2026-11-15")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("lays a month out in whole weeks that start on Monday", () => {
    // November 2026 starts on a Sunday, so the first row begins on Monday 26 October.
    const grid = monthGrid("2026-11-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0][0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(grid[0][6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(grid.at(-1)![6].date).toBe("2026-12-06");
    expect(grid.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it("needs only four rows when a month fits exactly", () => {
    // February 2027 starts on a Monday and has 28 days.
    expect(monthGrid("2027-02-01")).toHaveLength(4);
    expect(monthGrid("2027-02-01")[0][0]).toEqual({ date: "2027-02-01", inMonth: true });
  });
});
