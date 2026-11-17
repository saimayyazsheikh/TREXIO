import { describe, expect, it } from "vitest";
import { actionPayloadSchema, mergeSettings, rawActionSchema, resolveAction, resolveActions, runActionSchema, type ActionContext, type RawAction } from "@/lib/domain/assistant-actions";
import { DEFAULT_SETTINGS } from "@/lib/domain/automation";

const today = "2026-11-18";
const ctx: ActionContext = {
  today,
  people: [
    { id: "ali", name: "Ali Khan", businessId: "b1", designation: "Cashier", status: "active" },
    { id: "sara", name: "Sara Ahmed", businessId: "b1", designation: "", status: "active" },
    { id: "omar", name: "Omar Farooq", businessId: "b2", designation: "", status: "disabled" },
    { id: "ali2", name: "Ali Raza", businessId: "b2", designation: "", status: "active" },
  ],
  businesses: [
    { id: "b1", name: "Alpha Traders" },
    { id: "b2", name: "Beta Foods" },
  ],
  tasks: [
    { ref: "T1", id: "task-stock", title: "Count stock", kind: "oneoff", assigneeNames: ["Ali Khan"], date: "2026-11-18", dueTime: "17:00", priority: "high", status: "todo" },
    { ref: "T2", id: "task-daily", title: "Open shop", kind: "daily", assigneeNames: ["Ali Khan"], date: "2026-11-18", dueTime: "09:00", priority: "medium", status: "todo" },
  ],
  routines: [{ ref: "R1", id: "tpl-open", title: "Open shop", employeeName: "Ali Khan", dueTime: "09:00", activeDays: [1, 2, 3, 4, 5, 6], active: true }],
  leaves: [{ ref: "L1", id: "leave-1", employeeName: "Sara Ahmed", kind: "leave", fromDate: "2026-11-20", toDate: "2026-11-21", reason: "Family wedding" }],
};
const raw = (over: Partial<RawAction> & { kind: RawAction["kind"] }): RawAction => rawActionSchema.parse(over);
const run = (over: Partial<RawAction> & { kind: RawAction["kind"] }) => resolveAction(raw(over), ctx, 0);

describe("changing a task", () => {
  it("says what will change and keeps the exact payload", () => {
    const a = run({ kind: "task.update", task: "t1", date: "2026-11-20", time: "16:00", priority: "low", assignees: ["Sara"] });
    expect(a.issues).toEqual([]);
    expect(a.heading).toBe("Change “Count stock”");
    expect(a.lines).toEqual(["Day: Fri 20 Nov", "Due time: 16:00", "Priority: Low", "Given to: Sara Ahmed"]);
    expect(a.payload).toEqual({ kind: "task.update", taskId: "task-stock", changes: { date: "2026-11-20", dueTime: "16:00", priority: "low", assigneeIds: ["sara"] } });
  });

  it("refuses what it cannot do instead of guessing", () => {
    expect(run({ kind: "task.update", task: "T9", priority: "low" }).issues[0]).toMatch(/couldn't tell which task/);
    expect(run({ kind: "task.update", task: "T2", priority: "low" }).issues[0]).toMatch(/daily routine/);
    expect(run({ kind: "task.update", task: "T1", date: "2026-11-01" })).toMatchObject({ payload: null, issues: ["That day has already passed"] });
    expect(run({ kind: "task.update", task: "T1", assignees: ["Zoya"] }).issues[0]).toMatch(/No team member called/);
    expect(run({ kind: "task.update", task: "T1", assignees: ["Ali"] }).issues[0]).toMatch(/Which one: Ali Khan or Ali Raza/);
    expect(run({ kind: "task.update", task: "T1" }).issues[0]).toMatch(/Say what to change/);
  });

  it("accepts the person under \"who\" or \"assignees\" too, as the AI sometimes does", () => {
    expect(run({ kind: "task.update", task: "T1", who: ["Sara"] }).payload).toEqual({ kind: "task.update", taskId: "task-stock", changes: { assigneeIds: ["sara"] } });
    expect(run({ kind: "routine.create", who: ["Sara"], title: "Cash up" }).payload).toMatchObject({ employeeId: "sara" });
    expect(run({ kind: "employee.status", assignees: ["Sara"], status: "disabled" }).payload).toMatchObject({ employeeId: "sara" });
  });

  it("deletes and changes status", () => {
    expect(run({ kind: "task.delete", task: "T1" })).toMatchObject({ danger: true, payload: { kind: "task.delete", taskId: "task-stock" } });
    expect(run({ kind: "task.status", task: "T1", status: "completed" }).payload).toEqual({ kind: "task.status", taskId: "task-stock", status: "completed" });
    expect(run({ kind: "task.status", task: "T1", status: "blocked" }).issues[0]).toMatch(/done, started, or back to to-do/);
  });
});

describe("reminders and leave", () => {
  it("sends a reminder to named people or to everyone", () => {
    expect(run({ kind: "reminder.send", who: ["Sara", "Ali Khan"], message: "Report bhejo" }).payload).toEqual({ kind: "reminder.send", message: "Report bhejo", toUids: ["sara", "ali"], toAll: false });
    expect(run({ kind: "reminder.send", who: ["sab"], message: "Meeting 5 baje" }).payload).toEqual({ kind: "reminder.send", message: "Meeting 5 baje", toUids: [], toAll: true });
    expect(run({ kind: "reminder.send", who: [], message: "x" }).issues).toEqual(["Who should get it?"]);
    expect(run({ kind: "reminder.send", who: ["Sara"] }).issues[0]).toMatch(/What should the reminder say/);
  });

  it("approves or rejects a leave request it was shown", () => {
    expect(run({ kind: "leave.decide", leave: "L1", decision: "approve" })).toMatchObject({ heading: "Approve Sara Ahmed's leave", payload: { kind: "leave.decide", requestId: "leave-1", decision: "approve" } });
    expect(run({ kind: "leave.decide", leave: "L1", decision: "reject", note: "Busy week" })).toMatchObject({ danger: true, payload: { decision: "reject", note: "Busy week" } });
    expect(run({ kind: "leave.decide", leave: "L4", decision: "approve" }).issues[0]).toMatch(/couldn't tell which request/);
  });
});

describe("daily routines", () => {
  it("creates one with sensible defaults", () => {
    const a = run({ kind: "routine.create", person: "Sara", title: "Cash up", time: "18:00" });
    expect(a.payload).toEqual({ kind: "routine.create", employeeId: "sara", title: "Cash up", description: "", priority: "medium", dueTime: "18:00", steps: [], activeDays: [1, 2, 3, 4, 5, 6] });
    expect(a.lines[1]).toBe("Mon to Sat, due 18:00");
  });

  it("changes, pauses and deletes one of the routines it was shown", () => {
    expect(run({ kind: "routine.update", routine: "R1", time: "08:30" }).payload).toEqual({ kind: "routine.update", templateId: "tpl-open", changes: { dueTime: "08:30" } });
    expect(run({ kind: "routine.update", routine: "R1", active: false })).toMatchObject({ heading: "Pause the routine “Open shop”", payload: { changes: { active: false } } });
    expect(run({ kind: "routine.delete", routine: "R1" })).toMatchObject({ danger: true, payload: { kind: "routine.delete", templateId: "tpl-open" } });
    expect(run({ kind: "routine.update", routine: "R1" }).issues[0]).toMatch(/Say what to change/);
  });
});

describe("people", () => {
  it("proposes a new team member and asks for the password on the card, never from the AI", () => {
    const a = run({ kind: "employee.create", name: "Zoya Khan", business: "alpha", designation: "Cashier", phone: "+923001234567" });
    expect(a.needsPassword).toBe(true);
    expect(a.payload).toEqual({ kind: "employee.create", name: "Zoya Khan", username: "zoya.khan", businessId: "b1", designation: "Cashier", phone: "+923001234567" });
    expect(JSON.stringify(a)).not.toMatch(/password":/);
    expect(run({ kind: "employee.create", name: "Zoya Khan", business: "Gamma" }).issues[0]).toMatch(/No business called/);
    expect(run({ kind: "employee.create", business: "alpha" }).issues[0]).toMatch(/full name/);
  });

  it("turns someone off or on, resets a password, and changes details", () => {
    expect(run({ kind: "employee.status", person: "Sara", status: "disabled" })).toMatchObject({ danger: true, payload: { kind: "employee.status", employeeId: "sara", status: "disabled" } });
    expect(run({ kind: "employee.status", person: "Omar", status: "active" }).payload).toEqual({ kind: "employee.status", employeeId: "omar", status: "active" });
    expect(run({ kind: "employee.password", person: "Sara" })).toMatchObject({ needsPassword: true, payload: { kind: "employee.password", employeeId: "sara" } });
    expect(run({ kind: "employee.update", person: "Sara", designation: "Manager", business: "Beta" }).payload).toEqual({ kind: "employee.update", employeeId: "sara", changes: { designation: "Manager", businessId: "b2" } });
    expect(run({ kind: "employee.status", person: "Zoya", status: "disabled" }).issues[0]).toMatch(/No team member called/);
  });
});

describe("holidays, businesses, settings and pages", () => {
  it("adds and removes a holiday for everyone or one business", () => {
    expect(run({ kind: "holiday.add", date: "2026-12-25", name: "Quaid Day" }).payload).toEqual({ kind: "holiday.add", date: "2026-12-25", name: "Quaid Day", businessId: null });
    expect(run({ kind: "holiday.add", date: "2026-12-26", name: "Stocktake", business: "Beta" }).payload).toMatchObject({ businessId: "b2" });
    expect(run({ kind: "holiday.remove", date: "2026-12-25" })).toMatchObject({ danger: true, payload: { kind: "holiday.remove", businessId: null } });
    expect(run({ kind: "holiday.add", name: "Eid" }).issues).toContain("Which day?");
  });

  it("creates and changes a business", () => {
    expect(run({ kind: "business.create", name: "Gamma Stores", workStart: "10:00", workEnd: "19:00", days: [1, 2, 3, 4, 5] }).payload).toMatchObject({ kind: "business.create", name: "Gamma Stores", workStart: "10:00", workEnd: "19:00", workDays: [1, 2, 3, 4, 5] });
    expect(run({ kind: "business.update", business: "alpha", workEnd: "20:00" }).payload).toEqual({ kind: "business.update", businessId: "b1", changes: { workEnd: "20:00" } });
    expect(run({ kind: "business.update", business: "Zed", workEnd: "20:00" }).issues[0]).toMatch(/No business called/);
  });

  it("changes only settings that exist", () => {
    const a = run({ kind: "settings.update", settings: { escalationHighL1Min: 20, notifyOnBlocked: false, nonsense: 5 } });
    expect(a.payload).toEqual({ kind: "settings.update", changes: { escalationHighL1Min: 20, notifyOnBlocked: false } });
    expect(a.lines).toEqual(["First late alert, High priority: 20", "Tell me when someone is blocked: off"]);
    expect(run({ kind: "settings.update", settings: { nonsense: 5 } }).issues[0]).toMatch(/Which setting/);
  });

  it("merges settings over what is saved and rejects bad combinations", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { idleMin: 10 })).toMatchObject({ ok: true, settings: { idleMin: 10, escalationL1Min: 60 } });
    expect(mergeSettings(DEFAULT_SETTINGS, { escalationL1Min: 200 })).toMatchObject({ ok: false, message: "The second alert must come after the first" });
    expect(mergeSettings(DEFAULT_SETTINGS, { idleMin: 500 })).toMatchObject({ ok: false });
  });

  it("opens a page it knows", () => {
    expect(run({ kind: "open.page", page: "daily-report" })).toMatchObject({ href: "/admin/daily-report", payload: { kind: "open.page", page: "daily-report" } });
    expect(run({ kind: "open.page", page: "secrets" }).issues[0]).toMatch(/don't know that page/);
  });
});

describe("the payload that comes back on confirm", () => {
  it("is checked again, so a tampered or half-made one is refused", () => {
    expect(actionPayloadSchema.safeParse({ kind: "task.update", taskId: "t", changes: {} }).success).toBe(false);
    expect(actionPayloadSchema.safeParse({ kind: "task.status", taskId: "t", status: "blocked" }).success).toBe(false);
    expect(actionPayloadSchema.safeParse({ kind: "employee.create", name: "A", username: "x", businessId: "b" }).success).toBe(false);
    expect(actionPayloadSchema.safeParse({ kind: "delete.everything" }).success).toBe(false);
    expect(runActionSchema.safeParse({ action: { kind: "employee.password", employeeId: "sara" }, password: "short" }).success).toBe(false);
    expect(runActionSchema.safeParse({ action: { kind: "employee.password", employeeId: "sara" }, password: "long-enough-1" }).success).toBe(true);
  });

  it("resolves a list and caps how many it takes", () => {
    const many = Array.from({ length: 12 }, () => raw({ kind: "open.page", page: "kanban" }));
    expect(resolveActions(many, ctx)).toHaveLength(8);
  });
});
