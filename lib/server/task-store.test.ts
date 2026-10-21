import { beforeEach, describe, expect, it } from "vitest";
import { createOneOffTask, deleteTask, toggleSubtask, transitionTask, updateOneOffTask, type TaskDb } from "@/lib/server/task-store";
import { makeDb, newWorld, type World } from "@/lib/server/test-support/memory-task-db";
import { buildOneOffTask } from "@/lib/domain/task-builders";
import { createTaskSchema, updateTaskSchema } from "@/lib/domain/task-schemas";
import type { Actor, TaskData } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T06:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali", name: "Ali", role: "employee" };

const create = createTaskSchema.parse({ title: "Count stock", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeId: "ali", subtasks: ["Shelf A"] });

describe("shared task writer", () => {
  let world: World;
  let db: TaskDb;
  beforeEach(() => {
    world = newWorld();
    db = makeDb(world, now);
  });

  it("create writes the task, an audit entry and an activity entry together", async () => {
    const { taskId } = await createOneOffTask(db, admin, create);
    expect(world.tasks.get(taskId)).toMatchObject({ status: "todo", assigneeIds: ["ali"], businessId: "b1" });
    expect(world.audits).toHaveLength(1);
    expect(world.audits[0]).toMatchObject({ action: "task.create", entityId: taskId, businessId: "b1", actorId: "admin1", to: "todo" });
    expect(world.activities).toHaveLength(1);
    expect(world.activities[0].text).toBe("Boss assigned “Count stock” to Ali Khan");
    expect(world.activities[0].expireAt.getTime() - now.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("only the admin can create, and only for an active employee", async () => {
    await expect(createOneOffTask(db, ali, create)).rejects.toMatchObject({ status: 403 });
    await expect(createOneOffTask(db, admin, { ...create, assigneeId: "off" })).rejects.toThrow(/turned off/);
    await expect(createOneOffTask(db, admin, { ...create, assigneeId: "admin1" })).rejects.toThrow(/doesn't exist/);
    await expect(createOneOffTask(db, admin, { ...create, assigneeId: "ghost" })).rejects.toThrow(/doesn't exist/);
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
      await expect(transitionTask(db, { uid: "sara", name: "Sara", role: "employee" }, { taskId, status: "in_progress" })).rejects.toMatchObject({ status: 403 });
      expect(world.tasks.get(taskId)?.status).toBe("todo");
      expect(world.audits).toHaveLength(0);
      expect(world.activities).toHaveLength(0);
    });

    it("the sub-task gate holds end to end: tick the item, then complete", async () => {
      const subId = world.tasks.get(taskId)!.subtasks[0].id;
      await toggleSubtask(db, ali, { taskId, subtaskId: subId, done: true });
      await transitionTask(db, ali, { taskId, status: "completed" });
      expect(world.tasks.get(taskId)).toMatchObject({ status: "completed", subtaskDone: 1 });
      expect(world.audits.map((a) => a.action)).toEqual(["task.subtask", "task.status"]);
    });

    it("missing tasks are a clean 404", async () => {
      await expect(transitionTask(db, ali, { taskId: "nope", status: "in_progress" })).rejects.toMatchObject({ status: 404 });
    });

    it("edit reassigns and audits, with the new business on the entry", async () => {
      const t = world.tasks.get(taskId)!;
      const edit = updateTaskSchema.parse({
        taskId, title: "Count stock", description: "", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeId: "sara", requiresReview: false,
        subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title })),
      });
      await updateOneOffTask(db, admin, edit);
      expect(world.tasks.get(taskId)).toMatchObject({ assigneeIds: ["sara"], businessId: "b2" });
      expect(world.audits[0]).toMatchObject({ action: "task.update", businessId: "b2" });
      await expect(updateOneOffTask(db, ali, { ...edit, title: "Hacked" })).rejects.toMatchObject({ status: 403 });
    });

    it("delete is admin-only and audited", async () => {
      await expect(deleteTask(db, ali, taskId)).rejects.toThrow(/Only the admin/);
      await deleteTask(db, admin, taskId);
      expect(world.tasks.has(taskId)).toBe(false);
      expect(world.audits[0]).toMatchObject({ action: "task.delete", from: "todo", meta: { title: "Count stock" } });
    });
  });

  it("buildOneOffTask feeds the same shape the store persists", () => {
    const t = buildOneOffTask(create, { uid: "ali", businessId: "b1" }, admin, now, () => "x");
    expect(t.kind).toBe("oneoff");
  });
});
