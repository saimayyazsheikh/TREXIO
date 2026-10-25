import { beforeEach, describe, expect, it } from "vitest";
import { commentOnTask, createOneOffTask, deleteTask, explainMissedRoutine, toggleSubtask, transitionTask, updateDailyForToday, updateOneOffTask, type TaskDb } from "@/lib/server/task-store";
import { makeDb, newWorld, type World } from "@/lib/server/test-support/memory-task-db";
import { createTaskSchema, updateDailyTodaySchema, updateTaskSchema } from "@/lib/domain/task-schemas";
import type { Actor, TaskData } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T06:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali", name: "Ali", role: "employee" };
const sara: Actor = { uid: "sara", name: "Sara", role: "employee" };
const omar: Actor = { uid: "omar", name: "Omar", role: "employee" };

const base = { title: "Count stock", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeIds: ["ali"], subtasks: ["Shelf A"] };
const create = createTaskSchema.parse(base);
const make = (over: Record<string, unknown> = {}) => createTaskSchema.parse({ ...base, ...over });

/** The edit that changes nothing, as the UI would send it. */
const editOf = (world: World, taskId: string, over: Record<string, unknown> = {}) => {
  const t = world.tasks.get(taskId)!;
  return updateTaskSchema.parse({
    taskId, title: t.title, description: t.description, priority: t.priority, date: t.date, dueTime: "17:00", requiresReview: t.requiresReview,
    assigneeIds: t.assigneeIds, completionMode: t.completionMode, dependsOnIds: t.dependsOnIds, relatedTaskIds: t.relatedTaskIds,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title })), ...over,
  });
};

describe("shared task writer", () => {
  let world: World;
  let db: TaskDb;
  beforeEach(() => {
    world = newWorld();
    world.users.set("omar", { name: "Omar", businessId: "b1", role: "employee", status: "active" });
    db = makeDb(world, now);
  });

  it("create writes the task, an audit entry and an activity entry together", async () => {
    const { taskId } = await createOneOffTask(db, admin, create);
    expect(world.tasks.get(taskId)).toMatchObject({ status: "todo", assigneeIds: ["ali"], assigneeNames: { ali: "Ali Khan" }, businessId: "b1" });
    expect(world.audits).toHaveLength(1);
    expect(world.audits[0]).toMatchObject({ action: "task.create", entityId: taskId, businessId: "b1", actorId: "admin1", to: "todo" });
    expect(world.activities).toHaveLength(1);
    expect(world.activities[0].text).toBe("Boss assigned “Count stock” to Ali Khan");
    expect(world.activities[0].expireAt.getTime() - now.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("only the admin can create, and only for active employees of one business", async () => {
    await expect(createOneOffTask(db, ali, create)).rejects.toMatchObject({ status: 403 });
    await expect(createOneOffTask(db, admin, make({ assigneeIds: ["off"] }))).rejects.toThrow(/turned off/);
    await expect(createOneOffTask(db, admin, make({ assigneeIds: ["admin1"] }))).rejects.toThrow(/doesn't exist/);
    await expect(createOneOffTask(db, admin, make({ assigneeIds: ["ghost"] }))).rejects.toThrow(/doesn't exist/);
    await expect(createOneOffTask(db, admin, make({ assigneeIds: ["ali", "sara"] }))).rejects.toThrow(/same business/);
    expect(world.tasks.size).toBe(0);
    expect(world.audits).toHaveLength(0);
  });

  describe("changes to an existing task", () => {
    let taskId: string;
    beforeEach(async () => {
      ({ taskId } = await createOneOffTask(db, admin, create));
      world.audits.length = 0;
      world.activities.length = 0;
    });

    it("every status change leaves exactly one audit and one activity entry", async () => {
      await transitionTask(db, ali, { taskId, status: "in_progress" });
      expect(world.tasks.get(taskId)?.status).toBe("in_progress");
      expect(world.audits).toHaveLength(1);
      expect(world.audits[0]).toMatchObject({ action: "task.status", from: "todo", to: "in_progress", actorRole: "employee", entityType: "task" });
      expect(world.activities).toHaveLength(1);
      expect(world.activities[0].text).toBe("Ali started “Count stock”");
    });

    it("a rejected change writes nothing at all", async () => {
      await expect(transitionTask(db, ali, { taskId, status: "completed" })).rejects.toThrow(/Finish the checklist/);
      await expect(transitionTask(db, sara, { taskId, status: "in_progress" })).rejects.toMatchObject({ status: 403 });
      expect(world.tasks.get(taskId)?.status).toBe("todo");
      expect(world.audits).toHaveLength(0);
      expect(world.activities).toHaveLength(0);
    });

    it("ticking the last step finishes the task, with one line for the tick and one for the finish", async () => {
      const subId = world.tasks.get(taskId)!.subtasks[0].id;
      await toggleSubtask(db, ali, { taskId, subtaskId: subId, done: true });
      expect(world.tasks.get(taskId)).toMatchObject({ status: "completed", subtaskDone: 1, completion: { ali: { done: true } } });
      expect(world.audits.map((a) => a.action)).toEqual(["task.subtask", "task.status"]);
      expect(world.audits[0].meta).toMatchObject({ title: "Count stock", subtaskTitle: "Shelf A" });
      expect(world.audits[1]).toMatchObject({ from: "todo", to: "completed", actorId: "ali" });
    });

    it("an earlier step, or unticking, does not finish anything", async () => {
      ({ taskId } = await createOneOffTask(db, admin, make({ subtasks: ["One", "Two"] })));
      const [one, two] = world.tasks.get(taskId)!.subtasks.map((s) => s.id);
      await toggleSubtask(db, ali, { taskId, subtaskId: one, done: true });
      expect(world.tasks.get(taskId)?.status).toBe("todo");
      await toggleSubtask(db, ali, { taskId, subtaskId: two, done: true });
      expect(world.tasks.get(taskId)?.status).toBe("completed");
    });

    it("the last step on a task that needs review sends it for review, and the admin ticking never finishes it", async () => {
      const { taskId: reviewed } = await createOneOffTask(db, admin, make({ requiresReview: true }));
      await toggleSubtask(db, ali, { taskId: reviewed, subtaskId: world.tasks.get(reviewed)!.subtasks[0].id, done: true });
      expect(world.tasks.get(reviewed)?.status).toBe("under_review");
      const { taskId: byAdmin } = await createOneOffTask(db, admin, make());
      await toggleSubtask(db, admin, { taskId: byAdmin, subtaskId: world.tasks.get(byAdmin)!.subtasks[0].id, done: true });
      expect(world.tasks.get(byAdmin)?.status).toBe("todo");
    });

    it("with teammates still to finish, the last step finishes only your own part", async () => {
      const { taskId: shared } = await createOneOffTask(db, admin, make({ assigneeIds: ["ali", "omar"] }));
      await toggleSubtask(db, ali, { taskId: shared, subtaskId: world.tasks.get(shared)!.subtasks[0].id, done: true });
      expect(world.tasks.get(shared)).toMatchObject({ status: "in_progress", completion: { ali: { done: true }, omar: { done: false } } });
    });

    it("a step is still ticked when finishing is not allowed yet", async () => {
      const { taskId: first } = await createOneOffTask(db, admin, make({ subtasks: [] }));
      const { taskId: second } = await createOneOffTask(db, admin, make({ dependsOnIds: [first] }));
      await toggleSubtask(db, ali, { taskId: second, subtaskId: world.tasks.get(second)!.subtasks[0].id, done: true });
      expect(world.tasks.get(second)).toMatchObject({ status: "todo", subtaskDone: 1 });
    });

    it("comments are kept on the task and in the trail, by people on it or the admin only", async () => {
      await commentOnTask(db, ali, { taskId, text: "  Shelf B was empty  ", about: "finish" });
      await commentOnTask(db, admin, { taskId, text: "Thanks" });
      expect(world.tasks.get(taskId)?.notes?.map((n) => [n.byName, n.text, n.about])).toEqual([["Ali", "Shelf B was empty", "finish"], ["Boss", "Thanks", "comment"]]);
      expect(world.audits.map((a) => a.action)).toEqual(["task.comment", "task.comment"]);
      await expect(commentOnTask(db, sara, { taskId, text: "hi" })).rejects.toMatchObject({ status: 403 });
      await expect(commentOnTask(db, ali, { taskId, text: "   " })).rejects.toThrow(/Write a note/);
    });

    it("blocking records who and why, and unblocking is logged with the previous reason", async () => {
      await transitionTask(db, ali, { taskId, status: "blocked", reason: "Printer is down" });
      expect(world.tasks.get(taskId)).toMatchObject({ status: "blocked", blockedReason: "Printer is down", blockedBy: "ali" });
      await transitionTask(db, admin, { taskId, status: "in_progress" });
      expect(world.audits.at(-1)).toMatchObject({ actorId: "admin1", from: "blocked", to: "in_progress", meta: { previousReason: "Printer is down", unblockedBy: "admin1" } });
    });

    it("missing tasks are a clean 404", async () => {
      await expect(transitionTask(db, ali, { taskId: "nope", status: "in_progress" })).rejects.toMatchObject({ status: 404 });
    });

    it("edit reassigns and audits, with the new business on the entry", async () => {
      await updateOneOffTask(db, admin, editOf(world, taskId, { assigneeIds: ["sara"] }));
      expect(world.tasks.get(taskId)).toMatchObject({ assigneeIds: ["sara"], businessId: "b2", assigneeNames: { sara: "Sara" } });
      expect(world.audits[0]).toMatchObject({ action: "task.update", businessId: "b2" });
      await expect(updateOneOffTask(db, ali, editOf(world, taskId, { title: "Hacked", assigneeIds: ["sara"] }))).rejects.toMatchObject({ status: 403 });
    });

    it("delete is admin-only and audited", async () => {
      await expect(deleteTask(db, ali, taskId)).rejects.toThrow(/Only the admin/);
      await deleteTask(db, admin, taskId);
      expect(world.tasks.has(taskId)).toBe(false);
      expect(world.audits[0]).toMatchObject({ action: "task.delete", from: "todo", meta: { title: "Count stock" } });
    });
  });

  describe("several assignees", () => {
    it("completes only when everyone has ticked their part, each tick audited", async () => {
      const { taskId } = await createOneOffTask(db, admin, make({ assigneeIds: ["ali", "omar"], subtasks: [] }));
      await transitionTask(db, ali, { taskId, status: "completed" });
      expect(world.tasks.get(taskId)).toMatchObject({ status: "in_progress", completion: { ali: { done: true }, omar: { done: false } } });
      await transitionTask(db, omar, { taskId, status: "completed" });
      expect(world.tasks.get(taskId)).toMatchObject({ status: "completed" });
      expect(world.audits.map((a) => a.action)).toEqual(["task.create", "task.complete", "task.status"]);
    });
  });

  describe("dependencies", () => {
    let prereq: string;
    let dependent: string;
    beforeEach(async () => {
      ({ taskId: prereq } = await createOneOffTask(db, admin, make({ title: "Prepare invoices", subtasks: [] })));
      ({ taskId: dependent } = await createOneOffTask(db, admin, make({ title: "Send invoices", subtasks: [], assigneeIds: ["omar"], dependsOnIds: [prereq] })));
      world.audits.length = 0;
    });

    it("records the dependency, the prerequisite's title, and that it is waiting", () => {
      expect(world.tasks.get(dependent)).toMatchObject({ dependsOnIds: [prereq], waitingOnIds: [prereq], linkTitles: { [prereq]: "Prepare invoices" } });
    });

    it("the dependent can't start or finish until the prerequisite is completed", async () => {
      await expect(transitionTask(db, omar, { taskId: dependent, status: "in_progress" })).rejects.toThrow(/Waiting on: Prepare invoices/);
      await expect(transitionTask(db, admin, { taskId: dependent, status: "completed" })).rejects.toThrow(/Waiting on/);
      expect(world.tasks.get(dependent)?.status).toBe("todo");
      expect(world.audits).toHaveLength(0);
    });

    it("completing the prerequisite releases the dependent, and reopening makes it wait again", async () => {
      await transitionTask(db, ali, { taskId: prereq, status: "completed" });
      expect(world.tasks.get(dependent)?.waitingOnIds).toEqual([]);
      await transitionTask(db, omar, { taskId: dependent, status: "in_progress" });
      expect(world.tasks.get(dependent)?.status).toBe("in_progress");

      await transitionTask(db, ali, { taskId: prereq, status: "todo" });
      expect(world.tasks.get(dependent)?.waitingOnIds).toEqual([prereq]);
      await expect(transitionTask(db, omar, { taskId: dependent, status: "completed" })).rejects.toThrow(/Waiting on/);
    });

    it("a task is not released by a different task completing", async () => {
      const { taskId: other } = await createOneOffTask(db, admin, make({ title: "Unrelated", subtasks: [] }));
      await transitionTask(db, ali, { taskId: other, status: "completed" });
      expect(world.tasks.get(dependent)?.waitingOnIds).toEqual([prereq]);
    });

    it("rejects loops, self-dependency, missing and daily-routine targets", async () => {
      await expect(updateOneOffTask(db, admin, editOf(world, prereq, { dependsOnIds: [dependent] }))).rejects.toThrow(/loop/);
      await expect(updateOneOffTask(db, admin, editOf(world, prereq, { dependsOnIds: [prereq] }))).rejects.toThrow(/depend on itself/);
      await expect(updateOneOffTask(db, admin, editOf(world, prereq, { dependsOnIds: ["ghost"] }))).rejects.toThrow(/no longer exists/);
      world.tasks.set("daily1", { ...(world.tasks.get(prereq) as TaskData), kind: "daily" });
      await expect(updateOneOffTask(db, admin, editOf(world, prereq, { dependsOnIds: ["daily1"] }))).rejects.toThrow(/one-off/);
      expect(world.tasks.get(prereq)?.dependsOnIds).toEqual([]);
    });

    it("rejects a longer loop through a third task", async () => {
      const { taskId: third } = await createOneOffTask(db, admin, make({ title: "Archive", subtasks: [], dependsOnIds: [dependent] }));
      await expect(updateOneOffTask(db, admin, editOf(world, prereq, { dependsOnIds: [third] }))).rejects.toThrow(/loop/);
    });

    it("editing a dependency recomputes waiting-on from live statuses", async () => {
      await transitionTask(db, ali, { taskId: prereq, status: "completed" });
      await updateOneOffTask(db, admin, editOf(world, dependent, { dependsOnIds: [prereq], title: "Send all invoices" }));
      expect(world.tasks.get(dependent)?.waitingOnIds).toEqual([]);
    });

    it("renaming a task refreshes the title shown on tasks that link to it", async () => {
      await updateOneOffTask(db, admin, editOf(world, prereq, { title: "Prepare all invoices" }));
      expect(world.tasks.get(dependent)?.linkTitles[prereq]).toBe("Prepare all invoices");
    });

    it("deleting a prerequisite stops anything waiting on it", async () => {
      await deleteTask(db, admin, prereq);
      expect(world.tasks.get(dependent)).toMatchObject({ dependsOnIds: [], waitingOnIds: [], linkTitles: {} });
      await transitionTask(db, omar, { taskId: dependent, status: "in_progress" });
      expect(world.tasks.get(dependent)?.status).toBe("in_progress");
    });
  });

  describe("related links", () => {
    it("are two-way on create, edit and delete", async () => {
      const { taskId: a } = await createOneOffTask(db, admin, make({ title: "Month-end", subtasks: [] }));
      const { taskId: b } = await createOneOffTask(db, admin, make({ title: "Audit prep", subtasks: [], relatedTaskIds: [a] }));
      expect(world.tasks.get(b)).toMatchObject({ relatedTaskIds: [a], linkTitles: { [a]: "Month-end" } });
      expect(world.tasks.get(a)).toMatchObject({ relatedTaskIds: [b], linkTitles: { [b]: "Audit prep" } });

      await updateOneOffTask(db, admin, editOf(world, b, { relatedTaskIds: [] }));
      expect(world.tasks.get(a)).toMatchObject({ relatedTaskIds: [], linkTitles: {} });

      await updateOneOffTask(db, admin, editOf(world, a, { relatedTaskIds: [b] }));
      expect(world.tasks.get(b)?.relatedTaskIds).toEqual([a]);

      await deleteTask(db, admin, a);
      expect(world.tasks.get(b)).toMatchObject({ relatedTaskIds: [], linkTitles: {} });
    });

    it("a task can't be related to itself", async () => {
      const { taskId } = await createOneOffTask(db, admin, make({ subtasks: [] }));
      await expect(updateOneOffTask(db, admin, editOf(world, taskId, { relatedTaskIds: [taskId] }))).rejects.toThrow(/related to itself/);
    });
  });
});

describe("saying why a daily routine was not done", () => {
  it("is for the person it was for, only once the routine is missed", async () => {
    const world = newWorld();
    const late = new Date("2026-10-21T14:00:00Z"); // 19:00 in Pakistan, after a 17:00 deadline
    const db = makeDb(world, late);
    const id = "r1";
    world.tasks.set(id, { ...(await seedDaily(db, world)), } as TaskData);
    await expect(explainMissedRoutine(db, admin, { taskId: id, reason: "no stock" })).rejects.toMatchObject({ status: 403 });
    await expect(explainMissedRoutine(db, sara, { taskId: id, reason: "no stock" })).rejects.toMatchObject({ status: 403 });
    await expect(explainMissedRoutine(db, ali, { taskId: id, reason: "no" })).rejects.toThrow(/few words/);
    await explainMissedRoutine(db, ali, { taskId: id, reason: " Supplier never came " });
    expect(world.tasks.get(id)).toMatchObject({ missedReason: "Supplier never came" });
    expect(world.audits.at(-1)).toMatchObject({ action: "task.missed", meta: { title: "Open shop", reason: "Supplier never came" } });
  });

  it("is refused while the routine still has time, or once it is done", async () => {
    const world = newWorld();
    const early = makeDb(world, new Date("2026-10-21T06:00:00Z"));
    const id = "r1";
    world.tasks.set(id, await seedDaily(early, world));
    await expect(explainMissedRoutine(early, ali, { taskId: id, reason: "no stock" })).rejects.toThrow(/isn.t marked as not done/);
    world.tasks.set(id, { ...world.tasks.get(id)!, status: "completed" });
    await expect(explainMissedRoutine(makeDb(world, new Date("2026-10-21T14:00:00Z")), ali, { taskId: id, reason: "no stock" })).rejects.toThrow(/isn.t marked as not done/);
  });
});

describe("editing one day's copy of a daily routine", () => {
  const edit = (taskId: string, over: Record<string, unknown> = {}) =>
    updateDailyTodaySchema.parse({ taskId, title: "Open shop", description: "", priority: "high", dueTime: "17:00", subtasks: [], ...over });

  it("lets the admin change the time and priority, and records what changed", async () => {
    const world = newWorld();
    const db = makeDb(world, new Date("2026-10-21T06:00:00Z"));
    world.tasks.set("r1", await seedDaily(db, world));
    await updateDailyForToday(db, admin, edit("r1", { dueTime: "18:30", priority: "low" }));
    expect(world.tasks.get("r1")).toMatchObject({ priority: "low", kind: "daily", templateId: "t1" });
    expect(world.tasks.get("r1")!.dueAt!.toISOString()).toBe("2026-10-21T13:30:00.000Z");
    expect(world.audits.at(-1)).toMatchObject({ action: "task.update", meta: { title: "Open shop", scope: "today" } });
    expect(world.audits.at(-1)!.meta.changed).toEqual(["priority", "dueAt"]);
  });

  it("refuses non-admins, unchanged saves, one-off tasks and finished copies", async () => {
    const world = newWorld();
    const db = makeDb(world, new Date("2026-10-21T06:00:00Z"));
    world.tasks.set("r1", await seedDaily(db, world));
    await expect(updateDailyForToday(db, ali, edit("r1", { title: "Hacked" }))).rejects.toMatchObject({ status: 403 });
    await expect(updateDailyForToday(db, admin, edit("r1"))).rejects.toThrow(/Nothing changed/);
    const { taskId } = await createOneOffTask(db, admin, create);
    await expect(updateDailyForToday(db, admin, edit(taskId, { title: "Changed" }))).rejects.toThrow(/one-off/);
    world.tasks.set("r1", { ...world.tasks.get("r1")!, status: "completed" });
    await expect(updateDailyForToday(db, admin, edit("r1", { title: "Changed" }))).rejects.toThrow(/Reopen/);
  });
});

async function seedDaily(db: TaskDb, world: World): Promise<TaskData> {
  const { taskId } = await createOneOffTask(db, admin, createTaskSchema.parse({ ...base, title: "Open shop", subtasks: [], dueTime: "17:00", date: "2026-10-21" }));
  const task = world.tasks.get(taskId)!;
  world.tasks.delete(taskId);
  world.audits.length = 0;
  return { ...task, kind: "daily", templateId: "t1" };
}
