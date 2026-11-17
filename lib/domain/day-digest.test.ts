import { describe, expect, it } from "vitest";
import { buildTeamReports } from "@/lib/domain/performance";
import { buildDayDigest, digestText } from "@/lib/domain/day-digest";
import { pktInstant } from "@/lib/time";

const date = "2026-11-17";
const at = (hhmm: string) => pktInstant(date, hhmm).getTime();
const biz = { id: "b1", name: "Alpha", workDays: [1, 2, 3, 4, 5, 6, 7], workStart: "09:00", workEnd: "11:00" };
const t = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, kind: "oneoff" as const, date, status: "todo", priority: "medium", dueAtMs: null, completedAtMs: null, blockedReason: null, missedReason: null, assigneeIds: ["ali"], doneBy: [] as string[], businessId: "b1", ...over,
});

const reports = buildTeamReports({
  from: date,
  to: date,
  today: "2026-11-18",
  nowMs: pktInstant("2026-11-18", "08:00").getTime(),
  people: [
    { id: "ali", name: "Ali", businessId: "b1", workStart: null, workEnd: null },
    { id: "sara", name: "Sara", businessId: "b1", workStart: null, workEnd: null },
  ],
  businesses: [biz],
  tasks: [
    t("Count stock", { status: "completed", doneBy: ["ali"], completedAtMs: at("10:00"), dueAtMs: at("17:00") }),
    t("Open shop", { kind: "daily", dueAtMs: at("09:30"), missedReason: "No stock" }),
    t("Cash up", { kind: "daily", status: "completed", doneBy: ["ali"], dueAtMs: at("09:30"), completedAtMs: at("10:30"), missedReason: "Till repair" }),
    t("Invoices", { status: "blocked", blockedReason: "Waiting for prices" }),
  ] as never,
  journals: [],
  presence: [{ employeeId: "ali", date, activeSec: 7200, idleSec: 600, breakSec: 0, firstSeenMs: at("09:05"), lastSeenMs: at("11:00") }],
  away: [],
  closed: [],
});

describe("buildDayDigest", () => {
  const d = buildDayDigest(date, reports);
  const ali = d.lines.find((l) => l.id === "ali")!;

  it("sums up each person day", () => {
    expect(ali).toMatchObject({ status: "present", assigned: 4, done: 2, activeSec: 7200 });
    expect(ali.notDone).toEqual([{ title: "Open shop", reason: "No stock" }]);
    expect(ali.doneLate).toEqual([{ title: "Cash up", reason: "Till repair" }]);
    expect(ali.blocked).toEqual([{ title: "Invoices", reason: "Waiting for prices" }]);
    expect(d.lines.find((l) => l.id === "sara")!.status).toBe("absent");
  });

  it("totals the team", () => {
    expect(d.totals).toMatchObject({ assigned: 4, done: 2, notDone: 1, needReason: 0, doneLate: 1, present: 1, absent: 1, late: 0, onLeave: 0 });
  });

  it("writes a WhatsApp-ready text", () => {
    const text = digestText(d);
    expect(text).toContain("*Daily report: Tue 17 Nov*");
    expect(text).toContain("Tasks done 2 of 4 · 1 routine not done · 1 finished late");
    expect(text).toContain("*Ali* (Alpha): Present (in 9:05 AM)");
    expect(text).toContain("- Not done: Open shop (No stock)");
    expect(text).toContain("- Finished late: Cash up (Till repair)");
    expect(text).toContain("- Blocked: Invoices (Waiting for prices)");
    expect(text).toContain("*Sara* (Alpha): Absent");
  });
});
