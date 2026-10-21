import { beforeEach, describe, expect, it } from "vitest";
import { createTemplate, deleteTemplate, updateTemplate } from "@/lib/server/templates";
import { createTemplateSchema, updateTemplateSchema } from "@/lib/domain/task-schemas";
import { buildDailyInstance, dailyTaskId } from "@/lib/domain/task-builders";
import { makeDb, newWorld, type World } from "@/lib/server/test-support/memory-task-db";
import type { Actor } from "@/lib/domain/tasks";
import type { TaskDb } from "@/lib/server/task-store";

const now = new Date("2026-10-21T06:00:00Z"); // Wednesday, 11:00 PKT
const TODAY = "2026-10-21";
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali", name: "Ali", role: "employee" };

const create = createTemplateSchema.parse({
  employeeId: "ali", title: "Server check", description: "", priority: "medium", dueTime: "10:00",
  subtasks: [{ title: "Backups" }], activeDays: [1, 2, 3, 4, 5], active: true,
});

describe("daily routines", () => {
  let world: World;
  let db: TaskDb;
  let templateId: string;
  beforeEach(async () => {
    world = newWorld();
    db = makeDb(world, now);
    ({ templateId } = await createTemplate(db, admin, create));
    world.audits.length = 0;
    world.activities.length = 0;
  });

  const edit = (over: Record<string, unknown> = {}) =>
    updateTemplateSchema.parse({
      templateId, title: "Server check", description: "", priority: "medium", dueTime: "10:00",
      subtasks: world.templates.get(templateId)!.subtasks, activeDays: [1, 2, 3, 4, 5], active: true, ...over,
    });

  it("creation records the employee's business and logs it", async () => {
    const t = world.templates.get(templateId)!;
    expect(t).toMatchObject({ employeeId: "ali", businessId: "b1", active: true, activeDays: [1, 2, 3, 4, 5] });
    expect(t.subtasks[0].title).toBe("Backups");
    const w = newWorld();
    await createTemplate(makeDb(w, now), admin, create);
    expect(w.audits[0]).toMatchObject({ action: "template.create", entityType: "template" });
    expect(w.activities[0].text).toBe("Boss added the daily routine “Server check” for Ali Khan");
  });

  it("is admin only and needs an active employee", async () => {
    await expect(createTemplate(db, ali, create)).rejects.toMatchObject({ status: 403 });
    await expect(createTemplate(db, admin, { ...create, employeeId: "off" })).rejects.toThrow(/turned off/);
    await expect(createTemplate(db, admin, { ...create, employeeId: "ghost" })).rejects.toThrow(/doesn't exist/);
  });

  describe("edits apply from today onward", () => {
    const todaysId = () => dailyTaskId(templateId, "ali", TODAY);
    const yesterdayId = () => dailyTaskId(templateId, "ali", "2026-10-20");

    beforeEach(() => {
      const t = world.templates.get(templateId)!;
      world.tasks.set(todaysId(), buildDailyInstance(t, templateId, TODAY, now));
      world.tasks.set(yesterdayId(), { ...buildDailyInstance(t, templateId, "2026-10-20", now), status: "completed" });
    });

    it("refreshes today's copy while untouched, and never rewrites history", async () => {
      await updateTemplate(db, admin, edit({ title: "Server and network check", priority: "high" }));
      expect(world.templates.get(templateId)?.title).toBe("Server and network check");
      expect(world.tasks.get(todaysId())).toMatchObject({ title: "Server and network check", priority: "high" });
      expect(world.tasks.get(yesterdayId())?.title).toBe("Server check");
      expect(world.audits.map((a) => a.action)).toEqual(["template.update", "task.refresh"]);
      expect(world.audits[1]).toMatchObject({ actorRole: "system", actorId: "system" });
    });

    it("leaves today's copy alone once the employee has started it", async () => {
      world.tasks.set(todaysId(), { ...world.tasks.get(todaysId())!, status: "in_progress" });
      await updateTemplate(db, admin, edit({ title: "Renamed" }));
      expect(world.tasks.get(todaysId())?.title).toBe("Server check");
      expect(world.audits.map((a) => a.action)).toEqual(["template.update"]);
    });

    it("pausing stops future generation but keeps today's copy", async () => {
      await updateTemplate(db, admin, edit({ active: false }));
      expect(world.templates.get(templateId)?.active).toBe(false);
      expect(world.tasks.has(todaysId())).toBe(true);
      expect(world.activities[0].text).toBe("Boss paused the daily routine “Server check”");
    });

    it("missing routines are a clean 404, and employees can't edit", async () => {
      await expect(updateTemplate(db, admin, { ...edit(), templateId: "nope" })).rejects.toMatchObject({ status: 404 });
      await expect(updateTemplate(db, ali, edit())).rejects.toMatchObject({ status: 403 });
    });

    it("delete removes the routine but keeps existing days, and is audited", async () => {
      await deleteTemplate(db, admin, templateId);
      expect(world.templates.has(templateId)).toBe(false);
      expect(world.tasks.has(todaysId())).toBe(true);
      expect(world.audits[0]).toMatchObject({ action: "template.delete", meta: { title: "Server check" } });
      await expect(deleteTemplate(db, ali, templateId)).rejects.toMatchObject({ status: 403 });
    });
  });
});
