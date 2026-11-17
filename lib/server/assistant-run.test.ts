import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { name: string; args: unknown[] }[] = [];
vi.mock("@/lib/server/communication", () => ({ sendReminder: vi.fn(async (...args: unknown[]) => (calls.push({ name: "sendReminder", args }), { id: "r1", recipients: 2 })) }));
vi.mock("@/lib/server/time-off", () => ({ handleLeave: vi.fn(async (...args: unknown[]) => (calls.push({ name: "handleLeave", args }), {})) }));
vi.mock("@/lib/server/employees", () => ({
  createEmployee: vi.fn(async (...args: unknown[]) => (calls.push({ name: "createEmployee", args }), { uid: "new" })),
  updateEmployee: vi.fn(async (...args: unknown[]) => void calls.push({ name: "updateEmployee", args })),
  setEmployeeStatus: vi.fn(async (...args: unknown[]) => void calls.push({ name: "setEmployeeStatus", args })),
  resetEmployeePassword: vi.fn(async (...args: unknown[]) => void calls.push({ name: "resetEmployeePassword", args })),
}));

import { runAssistantAction, type RunDeps } from "@/lib/server/assistant-run";
import { createOneOffTask, type TaskDb } from "@/lib/server/task-store";
import { makeDb, newWorld, type World } from "@/lib/server/test-support/memory-task-db";
import { createTaskSchema } from "@/lib/domain/task-schemas";
import { runActionSchema } from "@/lib/domain/assistant-actions";
import { DEFAULT_SETTINGS } from "@/lib/domain/automation";
import type { Actor } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T06:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };

let world: World;
let taskDb: TaskDb;
let after: string[];
let calendar: Map<string, unknown>;
let businesses: Map<string, { name: string; color: string; workStart: string; workEnd: string; workDays: number[]; active: boolean }>;
let settings: { saved: unknown; stored: unknown };

const deps = (actor: Actor = admin): RunDeps => ({
  actor,
  taskDb,
  docDb: {} as never,
  employees: { tag: "employees" } as never,
  newId: () => "abc123def456",
  getEmployee: async (uid) => (uid === "ali" ? { name: "Ali Khan", contactEmail: "ali@example.com", phone: "+923001234567", businessId: "b1", designation: "Cashier", workStart: null, workEnd: null } : null),
  afterRoutineChange: async (id) => void after.push(id),
  getSettings: async () => settings.stored,
  saveSettings: async (s) => void (settings.saved = s),
  setCalendar: async (id, data) => void calendar.set(id, data),
  deleteCalendar: async (id) => calendar.delete(id),
  createBusiness: async (data) => (businesses.set("new", data), "new"),
  getBusiness: async (id) => businesses.get(id) ?? null,
  updateBusiness: async (id, data) => void businesses.set(id, data),
});
const run = (action: object, password?: string, actor?: Actor) => runAssistantAction(deps(actor), runActionSchema.parse({ action, password }));
const last = (name: string) => calls.filter((c) => c.name === name).at(-1)!;

beforeEach(() => {
  world = newWorld();
  world.users.set("omar", { name: "Omar", businessId: "b1", role: "employee", status: "active" });
  taskDb = makeDb(world, now);
  after = [];
  calls.length = 0;
  calendar = new Map();
  businesses = new Map([["b1", { name: "Alpha", color: "indigo", workStart: "09:00", workEnd: "18:00", workDays: [1, 2, 3, 4, 5, 6], active: true }]]);
  settings = { saved: null, stored: undefined };
});

const newTask = async (over: Record<string, unknown> = {}) =>
  (await createOneOffTask(taskDb, admin, createTaskSchema.parse({ title: "Count stock", priority: "high", date: "2026-10-21", dueTime: "17:00", assigneeIds: ["ali"], subtasks: ["Shelf A"], ...over }))).taskId;

describe("only the admin", () => {
  it("can run anything", async () => {
    await expect(run({ kind: "open.page", page: "kanban" }, undefined, { uid: "ali", name: "Ali", role: "employee" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("tasks", () => {
  it("changes only what was asked and keeps everything else, through the normal edit", async () => {
    const id = await newTask();
    const result = await run({ kind: "task.update", taskId: id, changes: { priority: "low", date: "2026-10-23", assigneeIds: ["omar"] } });
    expect(result.message).toBe("Updated “Count stock”.");
    expect(world.tasks.get(id)).toMatchObject({ title: "Count stock", priority: "low", date: "2026-10-23", assigneeIds: ["omar"], subtaskTotal: 1 });
    expect(world.tasks.get(id)!.dueAt!.toISOString()).toBe("2026-10-23T12:00:00.000Z");
    expect(world.audits.at(-1)).toMatchObject({ action: "task.update", actorId: "admin1" });
  });

  it("can remove the time, and refuses a daily routine task and a task that is gone", async () => {
    const id = await newTask();
    await run({ kind: "task.update", taskId: id, changes: { dueTime: "" } });
    expect(world.tasks.get(id)!.dueAt).toBeNull();
    world.tasks.set(id, { ...world.tasks.get(id)!, kind: "daily" });
    await expect(run({ kind: "task.update", taskId: id, changes: { priority: "low" } })).rejects.toMatchObject({ status: 409 });
    await expect(run({ kind: "task.update", taskId: "nope", changes: { priority: "low" } })).rejects.toMatchObject({ status: 404 });
  });

  it("deletes a task and marks it done or reopens it", async () => {
    const a = await newTask({ subtasks: [] });
    await run({ kind: "task.status", taskId: a, status: "completed" });
    expect(world.tasks.get(a)!.status).toBe("completed");
    await run({ kind: "task.status", taskId: a, status: "todo" });
    expect(world.tasks.get(a)!.status).toBe("todo");
    await expect(run({ kind: "task.delete", taskId: a })).resolves.toMatchObject({ message: "Deleted “Count stock”." });
    expect(world.tasks.has(a)).toBe(false);
    expect(world.audits.at(-1)).toMatchObject({ action: "task.delete" });
  });
});

describe("daily routines", () => {
  const create = { kind: "routine.create", employeeId: "ali", title: "Open shop", description: "", priority: "medium", dueTime: "09:00", steps: ["Lights", "Float"], activeDays: [1, 2, 3, 4, 5, 6] };

  it("creates one, gives today's copy straight away, and records it", async () => {
    await run(create);
    const [id, tpl] = [...world.templates][0];
    expect(tpl).toMatchObject({ employeeId: "ali", title: "Open shop", dueTime: "09:00", active: true, activeDays: [1, 2, 3, 4, 5, 6] });
    expect(tpl.subtasks.map((s) => s.title)).toEqual(["Lights", "Float"]);
    expect(after).toEqual(["ali"]);
    expect(world.audits.at(-1)).toMatchObject({ action: "template.create", entityId: id });
  });

  it("pauses, resumes and edits it, keeping the ids of steps that did not change", async () => {
    await run(create);
    const id = [...world.templates.keys()][0];
    const lights = world.templates.get(id)!.subtasks[0].id;
    await run({ kind: "routine.update", templateId: id, changes: { active: false } });
    expect(world.templates.get(id)!.active).toBe(false);
    await run({ kind: "routine.update", templateId: id, changes: { active: true, dueTime: "08:30", steps: ["Lights", "Safe check"] } });
    const t = world.templates.get(id)!;
    expect(t).toMatchObject({ active: true, dueTime: "08:30" });
    expect(t.subtasks[0].id).toBe(lights);
    expect(t.subtasks.map((s) => s.title)).toEqual(["Lights", "Safe check"]);
    expect(after).toEqual(["ali", "ali", "ali"]);
  });

  it("deletes it, and refuses one that is gone", async () => {
    await run(create);
    const id = [...world.templates.keys()][0];
    await expect(run({ kind: "routine.delete", templateId: id })).resolves.toMatchObject({ message: "Deleted the routine “Open shop”." });
    expect(world.templates.size).toBe(0);
    await expect(run({ kind: "routine.update", templateId: id, changes: { active: true } })).rejects.toMatchObject({ status: 404 });
  });
});

describe("reminders and leave", () => {
  it("sends a reminder with a fresh id, to the people chosen or to everyone", async () => {
    const r = await run({ kind: "reminder.send", message: "Report bhejo", toUids: ["ali", "omar"], toAll: false });
    expect(r.message).toBe("Reminder sent to 2 people.");
    expect(last("sendReminder").args[2]).toEqual({ id: "abc123def456", body: "Report bhejo", toUids: ["ali", "omar"], toAll: false, taskId: null });
    await run({ kind: "reminder.send", message: "Meeting", toUids: [], toAll: true });
    expect(last("sendReminder").args[2]).toMatchObject({ toAll: true });
  });

  it("decides leave", async () => {
    await run({ kind: "leave.decide", requestId: "leave-1", decision: "approve", note: "" });
    expect(last("handleLeave").args[2]).toEqual({ action: "decide", requestId: "leave-1", decision: "approve", note: "" });
    expect((await run({ kind: "leave.decide", requestId: "leave-1", decision: "reject", note: "Busy" })).message).toBe("Leave rejected.");
  });
});

describe("people", () => {
  it("adds a team member only with a password typed on the card", async () => {
    const action = { kind: "employee.create", name: "Zoya Khan", username: "zoya.khan", businessId: "b1", designation: "Cashier", phone: "+923001234567" };
    await expect(run(action)).rejects.toThrow(/Choose a password/);
    expect(calls.filter((c) => c.name === "createEmployee")).toHaveLength(0);
    // A password that is too short is refused before anything runs.
    expect(() => run(action, "short")).toThrow();
    const r = await run(action, "Zoya-Pass-2026");
    expect(r.message).toMatch(/Zoya Khan added.*zoya\.khan/);
    expect(last("createEmployee").args[1]).toMatchObject({ name: "Zoya Khan", username: "zoya.khan", businessId: "b1", password: "Zoya-Pass-2026", phone: "+923001234567" });
    expect(JSON.stringify(r)).not.toContain("Zoya-Pass-2026");
  });

  it("changes details on top of what is saved, turns people on and off, and resets a password", async () => {
    await run({ kind: "employee.update", employeeId: "ali", changes: { designation: "Manager" } });
    expect(last("updateEmployee").args[2]).toMatchObject({ name: "Ali Khan", designation: "Manager", businessId: "b1", phone: "+923001234567", contactEmail: "ali@example.com" });
    await expect(run({ kind: "employee.update", employeeId: "ghost", changes: { designation: "x" } })).rejects.toMatchObject({ status: 404 });
    await run({ kind: "employee.status", employeeId: "ali", status: "disabled" });
    expect(last("setEmployeeStatus").args.slice(1)).toEqual(["ali", "disabled"]);
    await expect(run({ kind: "employee.password", employeeId: "ali" })).rejects.toThrow(/Choose the new password/);
    await run({ kind: "employee.password", employeeId: "ali" }, "New-Pass-2026");
    expect(last("resetEmployeePassword").args.slice(1)).toEqual(["ali", "New-Pass-2026"]);
  });
});

describe("holidays, businesses and settings", () => {
  it("adds and removes a holiday or closure with the same ids the Holidays page uses", async () => {
    await run({ kind: "holiday.add", date: "2026-12-25", name: "Quaid Day", businessId: null });
    expect(calendar.get("2026-12-25_all")).toEqual({ date: "2026-12-25", name: "Quaid Day", type: "holiday", businessId: null });
    await run({ kind: "holiday.add", date: "2026-12-26", name: "Stocktake", businessId: "b1" });
    expect(calendar.get("2026-12-26_b1")).toMatchObject({ type: "closure", businessId: "b1" });
    await run({ kind: "holiday.remove", date: "2026-12-25", businessId: null });
    expect(calendar.has("2026-12-25_all")).toBe(false);
    await expect(run({ kind: "holiday.remove", date: "2026-12-25", businessId: null })).rejects.toMatchObject({ status: 404 });
  });

  it("creates a business and changes one on top of what is saved, with the form's own checks", async () => {
    await run({ kind: "business.create", name: "Gamma Stores", color: "teal", workStart: "10:00", workEnd: "19:00", workDays: [1, 2, 3, 4, 5] });
    expect(businesses.get("new")).toEqual({ name: "Gamma Stores", color: "teal", workStart: "10:00", workEnd: "19:00", workDays: [1, 2, 3, 4, 5], active: true });
    await run({ kind: "business.update", businessId: "b1", changes: { workEnd: "20:00" } });
    expect(businesses.get("b1")).toMatchObject({ name: "Alpha", workStart: "09:00", workEnd: "20:00" });
    await expect(run({ kind: "business.update", businessId: "b1", changes: { workEnd: "08:00" } })).rejects.toBeTruthy();
    await expect(run({ kind: "business.update", businessId: "nope", changes: { name: "Zed" } })).rejects.toMatchObject({ status: 404 });
  });

  it("changes settings on top of what is saved, and refuses a combination the form would refuse", async () => {
    settings.stored = { ...DEFAULT_SETTINGS, idleMin: 7 };
    await run({ kind: "settings.update", changes: { escalationHighL1Min: 20, notifyOnBlocked: false } });
    expect(settings.saved).toMatchObject({ idleMin: 7, escalationHighL1Min: 20, notifyOnBlocked: false, escalationL1Min: 60 });
    settings.saved = null;
    await expect(run({ kind: "settings.update", changes: { escalationL1Min: 500 } })).rejects.toThrow(/second alert must come after/);
    expect(settings.saved).toBeNull();
  });

  it("opens a page", async () => {
    expect(await run({ kind: "open.page", page: "workload" })).toEqual({ message: "Opening Workload.", href: "/admin/workload" });
  });
});
