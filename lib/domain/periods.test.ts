import { describe, expect, it } from "vitest";
import { rangeForPeriod } from "@/lib/domain/periods";

const today = "2026-10-23"; // a Friday

describe("rangeForPeriod", () => {
  it("covers the named periods up to today", () => {
    expect(rangeForPeriod("today", today)).toEqual({ from: today, to: today });
    expect(rangeForPeriod("week", today)).toEqual({ from: "2026-10-19", to: today });
    expect(rangeForPeriod("month", today)).toEqual({ from: "2026-10-01", to: today });
    expect(rangeForPeriod("last7", today)).toEqual({ from: "2026-10-17", to: today });
    expect(rangeForPeriod("last30", today)).toEqual({ from: "2026-09-24", to: today });
  });
  it("keeps a custom range in order and within the longest period", () => {
    expect(rangeForPeriod("custom", today, { from: "2026-10-10", to: "2026-10-05" })).toEqual({ from: "2026-10-05", to: "2026-10-10" });
    expect(rangeForPeriod("custom", today, { from: "2025-01-01", to: "2026-10-10" }).from).toBe("2026-06-13");
    expect(rangeForPeriod("custom", today)).toEqual({ from: today, to: today });
  });
});
