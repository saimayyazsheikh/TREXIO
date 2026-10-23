import { describe, expect, it } from "vitest";
import type { AnalyticsInput } from "@/lib/domain/analytics";
import { SYSTEM_PROMPT, buildPrompt, buildSummaryStats, condense, parseSummary, summaryId, templateSummary } from "@/lib/domain/ai-summary";

const now = Date.parse("2026-10-21T08:00:00Z");
const biz = (id: string, name: string) => ({ id, name, workDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "12:00" });
const input = (o: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  from: "2026-10-12", to: "2026-10-18", businessId: "", nowMs: now,
  people: [{ id: "ali", name: "Ali Khan", businessId: "b1", workStart: null, workEnd: null }, { id: "omar", name: "Omar Farooq", businessId: "b2", workStart: null, workEnd: null }],
  businesses: [biz("b1", "Alpha"), biz("b2", "Beta")],
  tasks: [
    { date: "2026-10-13", businessId: "b1", assigneeIds: ["ali"], doneBy: ["ali"], status: "completed", dueAtMs: 2, completedAtMs: 1 },
    { date: "2026-10-13", businessId: "b1", assigneeIds: ["ali"], doneBy: [], status: "todo", dueAtMs: 5, completedAtMs: null },
    { date: "2026-10-14", businessId: "b2", assigneeIds: ["omar"], doneBy: [], status: "blocked", dueAtMs: null, completedAtMs: null },
  ],
  presence: [{ employeeId: "ali", date: "2026-10-13", activeSec: 7200, idleSec: 0, breakSec: 0 }],
  journals: [],
  blocked: [{ reason: "x".repeat(300), businessId: "b2" }],
  closed: [],
  ...o,
});

describe("summaryId", () => {
  it("keeps the in-progress week apart from the finished one", () => {
    expect(summaryId("2026-10-12", false)).toBe("week_2026-10-12");
    expect(summaryId("2026-10-12", true)).toBe("week_2026-10-12_live");
  });
});

describe("buildSummaryStats", () => {
  const stats = buildSummaryStats(input(), input({ tasks: [] }), false);
  it("covers totals, people, each business and the previous week", () => {
    expect(stats.kpis).toMatchObject({ total: 3, completed: 1 });
    expect(stats.people.map((p) => p.name).sort()).toEqual(["Ali Khan", "Omar Farooq"]);
    expect(stats.people.find((p) => p.name === "Ali Khan")).toMatchObject({ business: "Alpha", assigned: 2, done: 1, activeHours: 2 });
    expect(stats.businesses).toEqual([
      { name: "Alpha", total: 2, completedPct: 50, onTimePct: 50, blocked: 0 },
      { name: "Beta", total: 1, completedPct: 0, onTimePct: 0, blocked: 1 },
    ]);
    expect(stats.previous).toMatchObject({ total: 0 });
  });
  it("clips long blocked reasons because they are free text", () => {
    expect(stats.blockedReasons[0].reason).toHaveLength(80);
  });
  it("has no previous week when none is given", () => {
    expect(buildSummaryStats(input(), null, true)).toMatchObject({ previous: null, partial: true });
  });
  it("never carries journal text, only a fill percentage", () => {
    const withText = buildSummaryStats(input({ journals: [{ employeeId: "ali", date: "2026-10-13", slots: { "09": { text: "SECRET diary line", taskIds: [] } } }] }), null, false);
    expect(JSON.stringify(withText)).not.toContain("SECRET");
    expect(JSON.stringify(buildPrompt(withText))).not.toContain("SECRET");
  });
});

describe("prompt", () => {
  it("states the layout and the no-invention rule, and says when the week is partial", () => {
    for (const heading of ["## Highlights", "## Bottlenecks", "## By business", "## Suggested actions"]) expect(SYSTEM_PROMPT).toContain(heading);
    expect(SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(buildPrompt(buildSummaryStats(input(), null, true))).toContain("partial week");
    expect(buildPrompt(buildSummaryStats(input(), null, false))).not.toContain("partial week");
  });
});

describe("templateSummary", () => {
  const text = templateSummary(buildSummaryStats(input(), input({ tasks: [] }), false));
  it("uses the same four headings the model is asked for", () => {
    expect(text.match(/^## .*/gm)).toEqual(["## Highlights", "## Bottlenecks", "## By business", "## Suggested actions"]);
  });
  it("reports the real figures", () => {
    expect(text).toContain("1 of 3 tasks were completed (33%)");
    expect(text).toContain("Alpha: 2 tasks");
    expect(text).toContain("most common reason");
  });
  it("handles a quiet week without crashing or claiming problems", () => {
    const closed = [{ ...biz("b1", "Alpha"), workDays: [] as number[] }, { ...biz("b2", "Beta"), workDays: [] as number[] }];
    const quiet = templateSummary(buildSummaryStats(input({ tasks: [], blocked: [], presence: [], businesses: closed }), null, false));
    expect(quiet).toContain("Nothing stood out");
    expect(quiet).toContain("0 of 0 tasks");
  });
});

describe("parseSummary and condense", () => {
  it("splits headings, bullets and paragraphs, and never produces HTML", () => {
    const blocks = parseSummary("## Highlights\n- one\n- two <script>alert(1)</script>\n\nA note.\n* three");
    expect(blocks).toEqual([
      { type: "heading", text: "Highlights" },
      { type: "bullets", items: ["one", "two <script>alert(1)</script>"] },
      { type: "paragraph", text: "A note." },
      { type: "bullets", items: ["three"] },
    ]);
  });
  it("flattens to a WhatsApp-sized line", () => {
    const flat = condense("## A\n- one\n- two\n\n## B\n- three", 900);
    expect(flat).toBe("A - one - two B - three");
    expect(condense("x".repeat(2000), 100)).toHaveLength(100);
  });
});
