import { describe, expect, it } from "vitest";
import { describeWorkDays } from "@/lib/domain/work-days";

describe("describeWorkDays", () => {
  it.each([
    [[1, 2, 3, 4, 5], "Mon–Fri"],
    [[1, 2, 3, 4, 5, 6, 7], "Every day"],
    [[1, 3, 6], "Mon, Wed, Sat"],
    [[1, 2], "Mon, Tue"],
    [[6, 7, 1, 2, 3], "Mon–Wed, Sat, Sun"],
  ])("%j -> %s", (days, expected) => {
    expect(describeWorkDays(days)).toBe(expected);
  });
});
