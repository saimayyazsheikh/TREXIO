import { describe, expect, it } from "vitest";
import { matchScore } from "@/lib/domain/command-search";

describe("matchScore", () => {
  it("is zero when a typed word matches nothing, or nothing is typed", () => {
    expect(matchScore("zzz", "Workload", "Who has room")).toBe(0);
    expect(matchScore("work zzz", "Workload")).toBe(0);
    expect(matchScore("   ", "Workload")).toBe(0);
  });

  it("ignores case and needs every word", () => {
    expect(matchScore("WORK", "Workload")).toBeGreaterThan(0);
    expect(matchScore("daily rep", "Daily report")).toBeGreaterThan(0);
    expect(matchScore("report daily", "Daily report")).toBeGreaterThan(0);
  });

  it("ranks a title that starts with the phrase above one that contains it, and a title above the extra words", () => {
    expect(matchScore("lea", "Leave")).toBeGreaterThan(matchScore("lea", "Dump tasks", "Where it leaves"));
    expect(matchScore("task", "Dump tasks")).toBeGreaterThan(matchScore("task", "Workload", "who gets the next task"));
    expect(matchScore("calendar", "Calendar")).toBeGreaterThan(matchScore("calendar", "Holidays", "calendar of closures"));
  });

  it("finds a word in the middle of a title", () => {
    expect(matchScore("report", "Daily report")).toBeGreaterThan(0);
    expect(matchScore("tasks", "Dump tasks")).toBeGreaterThan(0);
  });
});
