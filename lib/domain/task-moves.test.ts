import { describe, expect, it } from "vitest";
import { availableMoves, predictOutcome, type MoveSubject } from "@/lib/domain/task-moves";

const ali = { uid: "ali", role: "employee" as const };
const admin = { uid: "admin1", role: "admin" as const };

const task = (over: Partial<MoveSubject> = {}): MoveSubject => ({
  status: "todo", requiresReview: false, assigneeIds: ["ali"], completionMode: "all", subtaskTotal: 0, subtaskDone: 0, waitingOnIds: [], completion: {}, ...over,
});
const statuses = (t: MoveSubject, a: { uid: string; role: "admin" | "employee" } = ali) => availableMoves(t, a).map((m) => m.status);

describe("availableMoves", () => {
  it("offers employees todo/in progress/completed/blocked but never Under Review directly", () => {
    expect(statuses(task())).toEqual(["in_progress", "completed", "blocked"]);
    expect(statuses(task({ status: "in_progress" }))).toEqual(["todo", "completed", "blocked"]);
  });
  it("gives admin the review column too", () => {
    expect(statuses(task({ status: "in_progress" }), admin)).toEqual(["todo", "under_review", "completed", "blocked"]);
  });
  it("locks employees out of tasks under review", () => {
    expect(availableMoves(task({ status: "under_review", requiresReview: true }), ali)).toEqual([]);
    expect(statuses(task({ status: "under_review" }), admin)).toEqual(["in_progress", "completed", "blocked"]);
  });
  it("blocked tasks can only be restarted", () => {
    expect(statuses(task({ status: "blocked" }))).toEqual(["todo", "in_progress"]);
  });
  it("completed tasks can only be reopened", () => {
    expect(statuses(task({ status: "completed" }))).toEqual(["todo", "in_progress"]);
  });

  it("disables finishing until the checklist is done, and says why", () => {
    const moves = availableMoves(task({ status: "in_progress", subtaskTotal: 3, subtaskDone: 1 }), ali);
    const done = moves.find((m) => m.status === "completed")!;
    expect(done.enabled).toBe(false);
    expect(done.reason).toMatch(/1 of 3 done/);
    expect(moves.find((m) => m.status === "blocked")!.enabled).toBe(true);
  });
  it("disables starting and finishing while waiting on a prerequisite, but not blocking", () => {
    const moves = availableMoves(task({ waitingOnIds: ["t9"] }), ali);
    expect(moves.find((m) => m.status === "in_progress")).toMatchObject({ enabled: false, reason: expect.stringMatching(/Waiting on/) });
    expect(moves.find((m) => m.status === "completed")?.enabled).toBe(false);
    expect(moves.find((m) => m.status === "blocked")?.enabled).toBe(true);
  });
  it("won't let someone tick their part twice, but lets them take it back", () => {
    const moves = availableMoves(task({ status: "in_progress", assigneeIds: ["ali", "sara"], completion: { ali: { done: true } } }), ali);
    expect(moves.find((m) => m.status === "completed")).toMatchObject({ enabled: false, reason: expect.stringMatching(/finished your part/) });
    expect(moves.find((m) => m.kind === "untick")).toMatchObject({ status: "in_progress", enabled: true });
    expect(availableMoves(task({ status: "in_progress", assigneeIds: ["ali", "sara"] }), ali).some((m) => m.kind === "untick")).toBe(false);
  });
});

describe("predictOutcome", () => {
  it("is the requested status for anything but completion", () => {
    expect(predictOutcome(task(), "blocked", ali)).toBe("blocked");
  });
  it("a single assignee completes, or goes to review when required", () => {
    expect(predictOutcome(task(), "completed", ali)).toBe("completed");
    expect(predictOutcome(task({ requiresReview: true }), "completed", ali)).toBe("under_review");
    expect(predictOutcome(task({ requiresReview: true }), "completed", admin)).toBe("completed");
  });
  it("with several assignees in 'all' mode it waits for everyone", () => {
    const t = task({ assigneeIds: ["ali", "sara", "omar"], completion: { sara: { done: true } } });
    expect(predictOutcome(t, "completed", ali)).toBe("in_progress");
    expect(predictOutcome({ ...t, completion: { sara: { done: true }, omar: { done: true } } }, "completed", ali)).toBe("completed");
  });
  it("in 'any' mode the first finisher completes it", () => {
    expect(predictOutcome(task({ assigneeIds: ["ali", "sara"], completionMode: "any" }), "completed", ali)).toBe("completed");
  });
});
