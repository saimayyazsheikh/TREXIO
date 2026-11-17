import { describe, expect, it } from "vitest";
import { buildWorkload, type WorkloadTask } from "@/lib/domain/workload";
import { pktInstant } from "@/lib/time";

const today = "2026-11-18";
const nowMs = pktInstant(today, "12:00").getTime();
const at = (hhmm: string) => pktInstant(today, hhmm).getTime();
const people = [
  { id: "ali", name: "Ali", businessId: "b1" },
  { id: "sara", name: "Sara", businessId: "b1" },
];
const task = (over: Partial<WorkloadTask> = {}): WorkloadTask => ({ kind: "oneoff", date: today, status: "todo", priority: "medium", dueAtMs: null, assigneeIds: ["ali"], doneBy: [], ...over });
const run = (tasks: WorkloadTask[], away: string[] = []) => buildWorkload({ people, tasks, today, nowMs, away: new Set(away) });
const row = (rows: ReturnType<typeof run>, id: string) => rows.find((r) => r.id === id)!;

describe("buildWorkload", () => {
  it("counts what is open now and breaks it down", () => {
    const rows = run([
      task({ dueAtMs: at("17:00"), priority: "high" }),
      task({ date: "2026-11-10", dueAtMs: at("10:00") }),
      task({ status: "blocked" }),
      task({ status: "in_progress", dueAtMs: at("09:00") }),
    ]);
    expect(row(rows, "ali")).toMatchObject({ open: 4, today: 3, overdue: 2, blocked: 1, highPriority: 1 });
    expect(row(rows, "sara")).toMatchObject({ open: 0, load: "free" });
  });

  it("ignores finished work, a person's own tick on a shared task, and routines from other days", () => {
    const rows = run([
      task({ status: "completed" }),
      task({ assigneeIds: ["ali", "sara"], doneBy: ["ali"] }),
      task({ kind: "daily", date: "2026-11-15" }),
      task({ kind: "daily" }),
    ]);
    expect(row(rows, "ali").open).toBe(1);
    expect(row(rows, "sara").open).toBe(1);
  });

  it("keeps later-dated tasks and tasks waiting for review out of the load", () => {
    const rows = run([task({ date: "2026-11-25" }), task({ status: "under_review" })]);
    expect(row(rows, "ali")).toMatchObject({ open: 0, upcoming: 1, inReview: 1 });
  });

  it("calls someone free, busy or heavy, and marks people on leave as away", () => {
    const many = (n: number, over: Partial<WorkloadTask> = {}) => Array.from({ length: n }, () => task(over));
    expect(row(run(many(2)), "ali").load).toBe("free");
    expect(row(run(many(5)), "ali").load).toBe("normal");
    expect(row(run(many(8)), "ali").load).toBe("heavy");
    expect(row(run(many(3, { dueAtMs: at("08:00") })), "ali").load).toBe("heavy");
    expect(row(run(many(8), ["ali"]), "ali").load).toBe("away");
  });

  it("lists the busiest person first", () => {
    const rows = run([task({ assigneeIds: ["sara"] }), task({ assigneeIds: ["sara"] }), task()]);
    expect(rows.map((r) => r.id)).toEqual(["sara", "ali"]);
  });
});
