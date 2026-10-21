import { describe, expect, it } from "vitest";
import { buildDailyInstance, buildOneOffTask, dailyTaskId, isUntouched, planTaskUpdate, templateRunsOn, type TemplateData } from "@/lib/domain/task-builders";
import { createTaskSchema, updateTaskSchema } from "@/lib/domain/task-schemas";
import type { Actor } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T06:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali", name: "Ali", role: "employee" };
const A_ALI = { uid: "ali", name: "Ali", businessId: "b1" };
const A_SARA = { uid: "sara", name: "Sara", businessId: "b2" };
const NO_LINKS = { dependsOn: [], related: [] };
let n = 0;
const newId = () => `id${++n}`;

const input = createTaskSchema.parse({ title: "Count stock", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeIds: ["ali"], subtasks: ["Shelf A", "", "Shelf B"] });

describe("createTaskSchema", () => {
  it("drops blank checklist lines and nulls an empty due time", () => {
    expect(input.subtasks).toEqual(["Shelf A", "Shelf B"]);
    expect(createTaskSchema.parse({ ...input, dueTime: "" }).dueTime).toBeNull();
  });
  it("rejects bad input", () => {
    expect(createTaskSchema.safeParse({ ...input, title: "x" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...input, date: "tomorrow" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...input, dueTime: "5pm" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...input, priority: "urgent" }).success).toBe(false);
  });
});

describe("buildOneOffTask", () => {
  it("builds a todo task for the assignee with a PKT due time", () => {
    const t = buildOneOffTask(input, [A_ALI], admin, now, newId);
    expect(t).toMatchObject({ kind: "oneoff", status: "todo", assigneeIds: ["ali"], businessId: "b1", createdBy: "admin1", subtaskTotal: 2, subtaskDone: 0 });
    expect(t.dueAt?.toISOString()).toBe("2026-10-21T12:00:00.000Z"); // 17:00 PKT
    expect(t.subtasks.map((s) => s.title)).toEqual(["Shelf A", "Shelf B"]);
  });
});

describe("planTaskUpdate", () => {
  const task = buildOneOffTask(input, [A_ALI], admin, now, newId);
  const edit = updateTaskSchema.parse({
    taskId: "t1", title: "Count stock", description: "", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeIds: ["ali"], requiresReview: false,
    subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title })),
  });

  it("is admin only and refuses daily tasks", () => {
    expect(() => planTaskUpdate(task, { ...edit, title: "New" }, [A_ALI], NO_LINKS, ali, now, newId)).toThrow(/Only the admin/);
    expect(() => planTaskUpdate({ ...task, kind: "daily" }, { ...edit, title: "New" }, [A_ALI], NO_LINKS, admin, now, newId)).toThrow(/routine/);
  });
  it("refuses a no-op edit", () => {
    expect(() => planTaskUpdate(task, edit, [A_ALI], NO_LINKS, admin, now, newId)).toThrow(/Nothing changed/);
  });
  it("keeps progress on kept steps, adds new ones and records what changed", () => {
    const ticked = { ...task, subtasks: task.subtasks.map((s, i) => (i === 0 ? { ...s, done: true, doneAt: now, doneBy: "ali" } : s)), subtaskDone: 1 };
    const plan = planTaskUpdate(ticked, { ...edit, title: "Count all stock", subtasks: [...edit.subtasks, { title: "Shelf C" }] }, [A_ALI], NO_LINKS, admin, now, newId);
    expect(plan.patch.subtasks?.[0].done).toBe(true);
    expect(plan.patch.subtaskTotal).toBe(3);
    expect(plan.patch.subtaskDone).toBe(1);
    expect(plan.audit.meta.changed).toEqual(expect.arrayContaining(["title", "subtasks", "subtaskTotal"]));
  });
  it("moves a task to another assignee and business", () => {
    const plan = planTaskUpdate(task, edit, [A_SARA], NO_LINKS, admin, now, newId);
    expect(plan.patch).toMatchObject({ assigneeIds: ["sara"], businessId: "b2" });
  });
  it("won't add steps to a completed task", () => {
    const done = { ...task, status: "completed" as const, subtasks: task.subtasks.map((s) => ({ ...s, done: true })), subtaskDone: 2 };
    expect(() => planTaskUpdate(done, { ...edit, subtasks: [...edit.subtasks, { title: "More" }] }, [A_ALI], NO_LINKS, admin, now, newId)).toThrow(/Reopen/);
  });
});

describe("several assignees and links", () => {
  const A_OMAR = { uid: "omar", name: "Omar", businessId: "b1" };
  const links = {
    dependsOn: [{ id: "p1", title: "Prepare invoices", status: "in_progress" as const }, { id: "p2", title: "Approve budget", status: "completed" as const }],
    related: [{ id: "r1", title: "Month-end" }],
  };

  it("createTaskSchema dedupes people and links, and rejects an empty assignee list", () => {
    const parsed = createTaskSchema.parse({ ...input, assigneeIds: ["ali", "ali", "omar"], dependsOnIds: ["p1", "p1"], relatedTaskIds: ["r1"] });
    expect(parsed.assigneeIds).toEqual(["ali", "omar"]);
    expect(parsed.dependsOnIds).toEqual(["p1"]);
    expect(parsed.completionMode).toBe("all");
    expect(createTaskSchema.safeParse({ ...input, assigneeIds: [] }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...input, dependsOnIds: Array.from({ length: 11 }, (_, i) => `p${i}`) }).success).toBe(false);
  });

  it("builds per-person completion, names and denormalised link info", () => {
    const t = buildOneOffTask({ ...input, assigneeIds: ["ali", "omar"], completionMode: "any" }, [A_ALI, A_OMAR], admin, now, newId, links);
    expect(t).toMatchObject({
      assigneeIds: ["ali", "omar"], assigneeNames: { ali: "Ali", omar: "Omar" }, completionMode: "any",
      completion: { ali: { done: false, at: null }, omar: { done: false, at: null } },
      dependsOnIds: ["p1", "p2"], relatedTaskIds: ["r1"], waitingOnIds: ["p1"],
      linkTitles: { p1: "Prepare invoices", p2: "Approve budget", r1: "Month-end" },
    });
  });

  it("an edit keeps a kept person's tick, adds new people unticked and drops removed ones", () => {
    const base = buildOneOffTask({ ...input, assigneeIds: ["ali", "omar"] }, [A_ALI, A_OMAR], admin, now, newId);
    const ticked = { ...base, completion: { ali: { done: true, at: now }, omar: { done: false, at: null } } };
    const edit = updateTaskSchema.parse({
      taskId: "t1", title: "Count stock", description: "", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeIds: ["ali", "sara"], requiresReview: false,
      subtasks: base.subtasks.map((s) => ({ id: s.id, title: s.title })),
    });
    const plan = planTaskUpdate(ticked, edit, [A_ALI, { ...A_SARA, businessId: "b1" }], NO_LINKS, admin, now, newId);
    expect(plan.patch.completion).toEqual({ ali: { done: true, at: now }, sara: { done: false, at: null } });
    expect(plan.patch.assigneeNames).toEqual({ ali: "Ali", sara: "Sara" });
  });

  it("an edit that only changes links is a real change and updates waiting-on", () => {
    const base = buildOneOffTask(input, [A_ALI], admin, now, newId);
    const edit = updateTaskSchema.parse({
      taskId: "t1", title: "Count stock", description: "", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeIds: ["ali"], requiresReview: false,
      subtasks: base.subtasks.map((s) => ({ id: s.id, title: s.title })), dependsOnIds: ["p1"],
    });
    const plan = planTaskUpdate(base, edit, [A_ALI], links, admin, now, newId);
    expect(plan.patch.waitingOnIds).toEqual(["p1"]);
    expect(plan.audit.meta.changed).toEqual(expect.arrayContaining(["dependsOnIds", "waitingOnIds", "linkTitles"]));
  });
});

describe("daily routines", () => {
  const template: TemplateData = {
    employeeId: "ali", businessId: "b1", title: "Server check", description: "", priority: "medium", dueTime: "10:00",
    subtasks: [{ id: "s1", title: "Backups" }], activeDays: [1, 2, 3, 4, 5], active: true, order: 0, updatedAt: now,
  };
  const business = { active: true, workDays: [1, 2, 3, 4, 5, 6] };

  it("builds a deterministic id", () => {
    expect(dailyTaskId("t1", "ali", "2026-10-21")).toBe("t1_ali_2026-10-21");
  });
  it("runs only on days the routine AND the business are open", () => {
    expect(templateRunsOn(template, business, "2026-10-21")).toBe(true); // Wed
    expect(templateRunsOn(template, business, "2026-10-24")).toBe(false); // Sat: business open, routine not
    expect(templateRunsOn({ ...template, activeDays: [6] }, { ...business, workDays: [1] }, "2026-10-24")).toBe(false); // Sat: routine on, business closed
    expect(templateRunsOn(template, business, "2026-10-25")).toBe(false); // Sun
  });
  it("is skipped when paused or the business is inactive", () => {
    expect(templateRunsOn({ ...template, active: false }, business, "2026-10-21")).toBe(false);
    expect(templateRunsOn(template, { ...business, active: false }, "2026-10-21")).toBe(false);
  });
  it("builds a fresh instance from the routine", () => {
    const t = buildDailyInstance(template, "t1", "Ali", "2026-10-21", now);
    expect(t).toMatchObject({ kind: "daily", templateId: "t1", date: "2026-10-21", status: "todo", assigneeIds: ["ali"], createdBy: "system", subtaskTotal: 1 });
    expect(t.dueAt?.toISOString()).toBe("2026-10-21T05:00:00.000Z");
    expect(t.subtasks[0]).toMatchObject({ id: "s1", done: false });
  });
  it("only untouched copies can be refreshed", () => {
    expect(isUntouched({ status: "todo", subtaskDone: 0 })).toBe(true);
    expect(isUntouched({ status: "in_progress", subtaskDone: 0 })).toBe(false);
    expect(isUntouched({ status: "todo", subtaskDone: 1 })).toBe(false);
  });
});
