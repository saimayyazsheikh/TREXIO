import { describe, expect, it } from "vitest";
import { canTransition, dueState, planSubtaskToggle, planTransition, countSubtasks, type Actor, type Subtask, type TaskData } from "@/lib/domain/tasks";
import { TASK_STATUSES, type TaskStatus } from "@/lib/domain/constants";

const now = new Date("2026-10-21T06:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali", name: "Ali", role: "employee" };
const sara: Actor = { uid: "sara", name: "Sara", role: "employee" };

const sub = (id: string, done = false): Subtask => ({ id, title: `Step ${id}`, done, doneAt: done ? now : null, doneBy: done ? "ali" : null });

function task(over: Partial<TaskData> = {}): TaskData {
  const subtasks = over.subtasks ?? [];
  return {
    kind: "oneoff", templateId: null, date: "2026-10-21", businessId: "b1", assigneeIds: ["ali"], completion: {}, completionMode: "all",
    title: "Server check", description: "", priority: "medium", status: "todo", blockedReason: null, blockedBy: null, dueAt: null,
    requiresReview: false, subtasks, subtaskTotal: subtasks.length, subtaskDone: subtasks.filter((s) => s.done).length,
    relatedTaskIds: [], dependsOnIds: [], attachments: [], tags: [], createdBy: "admin1", createdAt: now, updatedAt: now,
    completedAt: null, escalation: { l1At: null, l2At: null }, ...over,
  };
}

describe("transition table", () => {
  const allowed: [TaskStatus, TaskStatus][] = [
    ["todo", "in_progress"], ["todo", "completed"], ["in_progress", "completed"], ["in_progress", "blocked"], ["blocked", "in_progress"],
    ["under_review", "completed"], ["completed", "todo"], ["completed", "in_progress"],
  ];
  it.each(allowed)("allows %s -> %s", (a, b) => expect(canTransition(a, b)).toBe(true));

  it("never lets a status move to itself or skip the review rules", () => {
    for (const s of TASK_STATUSES) expect(canTransition(s, s)).toBe(false);
    expect(canTransition("completed", "blocked")).toBe(false);
    expect(canTransition("completed", "under_review")).toBe(false);
    expect(canTransition("blocked", "completed")).toBe(false);
  });
});

describe("planTransition", () => {
  it("starts a task and describes it in audit + activity", () => {
    const plan = planTransition(task(), "in_progress", ali, { now });
    expect(plan.patch.status).toBe("in_progress");
    expect(plan.audit).toMatchObject({ action: "task.status", from: "todo", to: "in_progress" });
    expect(plan.activityText).toBe("Ali started “Server check”");
  });

  it("completes a task, stamps completion and completedAt", () => {
    const plan = planTransition(task({ status: "in_progress" }), "completed", ali, { now });
    expect(plan.patch.status).toBe("completed");
    expect(plan.patch.completedAt).toEqual(now);
    expect(plan.patch.completion).toEqual({ ali: { done: true, at: now } });
  });

  it("reopening clears completion and completedAt", () => {
    const done = task({ status: "completed", completedAt: now, completion: { ali: { done: true, at: now } } });
    const plan = planTransition(done, "todo", ali, { now });
    expect(plan.patch).toMatchObject({ status: "todo", completedAt: null, completion: { ali: { done: false, at: null } } });
    expect(plan.activityText).toBe("Ali reopened “Server check”");
  });

  it("rejects a task assigned to someone else, but lets the admin act", () => {
    expect(() => planTransition(task(), "in_progress", sara, { now })).toThrow(/isn't assigned to you/);
    expect(planTransition(task(), "in_progress", admin, { now }).patch.status).toBe("in_progress");
  });

  it("rejects moves the workflow doesn't allow and no-op moves", () => {
    expect(() => planTransition(task({ status: "completed" }), "blocked", admin, { now, reason: "because" })).toThrow(/can't move/);
    expect(() => planTransition(task(), "todo", ali, { now })).toThrow(/already/);
  });

  describe("sub-task gate", () => {
    const partial = task({ subtasks: [sub("a", true), sub("b"), sub("c")] });
    it("blocks completion until every sub-task is done", () => {
      expect(() => planTransition(partial, "completed", ali, { now })).toThrow(/Finish the checklist first \(1 of 3 done\)/);
      expect(() => planTransition(partial, "completed", admin, { now })).toThrow(/Finish the checklist/);
    });
    it("also gates sending to review", () => {
      expect(() => planTransition({ ...partial, requiresReview: true }, "completed", ali, { now })).toThrow(/Finish the checklist/);
    });
    it("allows completion once everything is ticked", () => {
      const all = task({ subtasks: [sub("a", true), sub("b", true)] });
      expect(planTransition(all, "completed", ali, { now }).patch.status).toBe("completed");
    });
    it("does not gate starting or blocking", () => {
      expect(planTransition(partial, "in_progress", ali, { now }).patch.status).toBe("in_progress");
      expect(planTransition(partial, "blocked", ali, { now, reason: "waiting on parts" }).patch.status).toBe("blocked");
    });
  });

  describe("review flow", () => {
    const needsReview = task({ requiresReview: true, status: "in_progress" });
    it("an employee's completion lands in under_review", () => {
      const plan = planTransition(needsReview, "completed", ali, { now });
      expect(plan.patch.status).toBe("under_review");
      expect(plan.patch.completedAt).toBeNull();
      expect(plan.activityText).toBe("Ali sent for review “Server check”");
    });
    it("only the admin can approve or send back", () => {
      const inReview = task({ requiresReview: true, status: "under_review" });
      expect(() => planTransition(inReview, "completed", ali, { now })).toThrow(/Only the admin/);
      expect(() => planTransition(inReview, "in_progress", ali, { now })).toThrow(/Only the admin/);
      expect(planTransition(inReview, "completed", admin, { now }).activityText).toBe("Boss approved “Server check”");
      expect(planTransition(inReview, "in_progress", admin, { now }).patch.status).toBe("in_progress");
    });
    it("the admin can complete directly", () => {
      expect(planTransition(needsReview, "completed", admin, { now }).patch.status).toBe("completed");
    });
  });

  describe("blocked", () => {
    it("requires a reason between 3 and 300 characters", () => {
      expect(() => planTransition(task(), "blocked", ali, { now })).toThrow(/why it's blocked/);
      expect(() => planTransition(task(), "blocked", ali, { now, reason: "  ab " })).toThrow(/why it's blocked/);
      expect(() => planTransition(task(), "blocked", ali, { now, reason: "x".repeat(301) })).toThrow(/under 300/);
    });
    it("stores who blocked it and why, and clears it on unblock with the audit trail", () => {
      const blocked = planTransition(task(), "blocked", ali, { now, reason: " Printer is down " });
      expect(blocked.patch).toMatchObject({ status: "blocked", blockedReason: "Printer is down", blockedBy: "ali" });
      const unblocked = planTransition(task({ status: "blocked", blockedReason: "Printer is down", blockedBy: "ali" }), "in_progress", admin, { now });
      expect(unblocked.patch).toMatchObject({ status: "in_progress", blockedReason: null, blockedBy: null });
      expect(unblocked.audit.meta).toMatchObject({ previousReason: "Printer is down", unblockedBy: "admin1" });
      expect(unblocked.activityText).toBe("Boss unblocked and restarted “Server check”");
    });
  });
});

describe("planSubtaskToggle", () => {
  const t = task({ subtasks: [sub("a"), sub("b", true)] });
  it("ticks an item and recomputes progress", () => {
    const plan = planSubtaskToggle(t, "a", true, ali, now);
    expect(plan.patch.subtaskDone).toBe(2);
    expect(plan.patch.subtaskTotal).toBe(2);
    expect(plan.patch.subtasks?.find((s) => s.id === "a")).toMatchObject({ done: true, doneBy: "ali", doneAt: now });
    expect(plan.audit.meta).toMatchObject({ progress: "2/2" });
  });
  it("unticks an item", () => {
    const plan = planSubtaskToggle(t, "b", false, ali, now);
    expect(plan.patch.subtaskDone).toBe(0);
    expect(plan.patch.subtasks?.find((s) => s.id === "b")).toMatchObject({ done: false, doneBy: null, doneAt: null });
  });
  it("rejects other employees, unknown items, no-ops and completed tasks", () => {
    expect(() => planSubtaskToggle(t, "a", true, sara, now)).toThrow(/isn't assigned/);
    expect(() => planSubtaskToggle(t, "zzz", true, ali, now)).toThrow(/doesn't exist/);
    expect(() => planSubtaskToggle(t, "b", true, ali, now)).toThrow(/already/);
    expect(() => planSubtaskToggle({ ...t, status: "completed" }, "a", true, ali, now)).toThrow(/Reopen/);
  });
  it("countSubtasks reports totals", () => {
    expect(countSubtasks(t.subtasks)).toEqual({ total: 2, done: 1 });
  });
});

describe("dueState", () => {
  const today = "2026-10-21";
  it("classifies by due time", () => {
    expect(dueState(task({ dueAt: new Date("2026-10-21T05:00:00Z") }), now, today)).toBe("overdue");
    expect(dueState(task({ dueAt: new Date("2026-10-21T07:30:00Z") }), now, today)).toBe("soon");
    expect(dueState(task({ dueAt: new Date("2026-10-21T12:00:00Z") }), now, today)).toBe("later");
  });
  it("completed tasks are done; untimed tasks are overdue only after their day", () => {
    expect(dueState(task({ status: "completed", dueAt: new Date("2026-10-20T05:00:00Z") }), now, today)).toBe("done");
    expect(dueState(task({ date: "2026-10-20" }), now, today)).toBe("overdue");
    expect(dueState(task(), now, today)).toBe("none");
  });
});
