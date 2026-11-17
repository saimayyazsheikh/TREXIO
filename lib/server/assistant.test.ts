import { describe, expect, it } from "vitest";
import { askAssistant, type AssistantDeps } from "@/lib/server/assistant";
import type { AiProvider } from "@/lib/server/ai";

const now = new Date("2026-11-18T06:00:00Z");
const people = [
  { id: "ali", name: "Ali Khan", businessId: "b1", designation: "Cashier", status: "active" as const },
  { id: "sara", name: "Sara Ahmed", businessId: "b1", designation: "", status: "active" as const },
  { id: "omar", name: "Omar Farooq", businessId: "b2", designation: "", status: "disabled" as const },
];

const deps = (reply: string | (() => string), name: AiProvider["name"] = "gemini", seen: { prompt?: string; system?: string } = {}): AssistantDeps => ({
  now: () => now,
  provider: {
    name,
    model: "test",
    generate: async (req) => {
      seen.prompt = req.prompt;
      seen.system = req.system;
      return typeof reply === "function" ? reply() : reply;
    },
  },
  loadPeople: async () => people,
  loadBusinesses: async () => [{ id: "b1", name: "Alpha" }],
  loadLoads: async () => [{ personId: "ali", open: 4, overdue: 0, today: 2, away: false }],
  loadLists: async () => ({
    tasks: [
      { id: "task-fred", title: "Fred ke stores", kind: "oneoff" as const, assigneeNames: ["Ali Khan"], date: "2026-11-18", dueTime: "12:00", priority: "medium" as const, status: "todo" },
      { id: "task-inv", title: "Invoices", kind: "oneoff" as const, assigneeNames: ["Sara Ahmed"], date: "2026-11-19", dueTime: "17:00", priority: "high" as const, status: "todo" },
    ],
    routines: [{ id: "tpl-open", title: "Open shop", employeeName: "Ali Khan", dueTime: "09:00", activeDays: [1, 2, 3, 4, 5, 6], active: true }],
    leaves: [{ id: "leave-1", employeeName: "Sara Ahmed", kind: "leave" as const, fromDate: "2026-11-20", toDate: "2026-11-21", reason: "Wedding" }],
  }),
});

describe("askAssistant", () => {
  it("turns plain words into proposals for the admin to confirm", async () => {
    const seen: { prompt?: string } = {};
    const answer = await askAssistant(
      deps('{"reply":"Two tasks ready","tasks":[{"title":"Count stock","who":["Ali"],"date":"2026-11-19","time":"10:00","priority":"high"},{"title":"Ask about paint"}]}', "gemini", seen),
      { message: "kal subah 10 baje Ali ko stock count, aur paint ke baare mein poochna hai" },
    );
    expect(answer.reply).toBe("Two tasks ready");
    expect(answer.proposals).toHaveLength(2);
    expect(answer.proposals[0]).toMatchObject({ title: "Count stock", assigneeIds: ["ali"], date: "2026-11-19", dueTime: "10:00", priority: "high", dump: false, issues: [] });
    expect(answer.proposals[1]).toMatchObject({ dump: true, date: null });
    // It was told today's real date and the team's figures.
    expect(seen.prompt).toContain("Today is Wed 2026-11-18");
    expect(seen.prompt).toContain("Ali Khan (Alpha, Cashier): 4 open, 0 overdue, 2 due today");
  });

  it("passes a plain answer through, with no tasks", async () => {
    const answer = await askAssistant(deps('{"reply":"Sara has the most room.","tasks":[]}'), { message: "who is free?" });
    expect(answer).toEqual({ reply: "Sara has the most room.", proposals: [], alerts: [], actions: [] });
  });

  it("asks the admin to rephrase when the AI sends something unreadable", async () => {
    const answer = await askAssistant(deps("{ \"reply\": \"half a message"), { message: "asdf" });
    expect(answer.proposals).toEqual([]);
    expect(answer.alerts).toEqual([]);
    expect(answer.actions).toEqual([]);
    expect(answer.reply).toMatch(/couldn't understand that/);
  });

  it("shows the AI's own words when it answers in plain text instead of the expected format", async () => {
    const answer = await askAssistant(deps("Which task do you mean? I see Cash up and Invoices."), { message: "alert me if the bank task is late" });
    expect(answer).toEqual({ reply: "Which task do you mean? I see Cash up and Invoices.", proposals: [], alerts: [], actions: [] });
  });

  it("proposes changes to what exists as confirmable cards, with the exact payload", async () => {
    const answer = await askAssistant(
      deps('{"reply":"Cards ready","tasks":[],"alerts":[],"actions":[{"kind":"task.update","task":"T2","assignees":["Ali"],"date":"2026-11-20"},{"kind":"leave.decide","leave":"L1","decision":"approve"},{"kind":"routine.update","routine":"R1","time":"08:30"},{"kind":"employee.status","person":"Omar","status":"active"},{"kind":"open.page","page":"workload"}]}'),
      { message: "move things around" },
    );
    expect(answer.actions.map((a) => [a.kind, a.issues.length])).toEqual([["task.update", 0], ["leave.decide", 0], ["routine.update", 0], ["employee.status", 0], ["open.page", 0]]);
    expect(answer.actions[0].payload).toEqual({ kind: "task.update", taskId: "task-inv", changes: { date: "2026-11-20", assigneeIds: ["ali"] } });
    expect(answer.actions[1].payload).toMatchObject({ requestId: "leave-1", decision: "approve" });
    expect(answer.actions[3].payload).toEqual({ kind: "employee.status", employeeId: "omar", status: "active" });
    expect(answer.actions[4].href).toBe("/admin/workload");
    expect(answer.reply).toBe("Cards ready");
  });

  it("says what is wrong, instead of a cheerful \"ready\", when every card has a problem", async () => {
    const answer = await askAssistant(deps('{"reply":"Zoya ko band karne ka card tayyar hai.","tasks":[],"alerts":[],"actions":[{"kind":"employee.status","person":"Zoya","status":"disabled"}]}'), { message: "Zoya ko off kar do" });
    expect(answer.reply).toBe("Yeh abhi nahi ho sakta: No team member called “Zoya”");
    // One good card keeps the AI's own words.
    const mixed = await askAssistant(deps('{"reply":"Do cards tayyar hain.","tasks":[],"alerts":[],"actions":[{"kind":"employee.status","person":"Zoya","status":"disabled"},{"kind":"open.page","page":"team"}]}'), { message: "x" });
    expect(mixed.reply).toBe("Do cards tayyar hain.");
  });

  it("flags a label it was never given instead of guessing a task", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[],"alerts":[],"actions":[{"kind":"task.delete","task":"T99"}]}'), { message: "delete it" });
    expect(answer.actions[0]).toMatchObject({ payload: null });
    expect(answer.actions[0].issues[0]).toMatch(/couldn't tell which task/);
  });

  it("never sends a password to the AI, and says where to type it", async () => {
    let called = false;
    const spy = deps(() => ((called = true), "{}"));
    for (const message of ["Sara ka password: Sara2026pass rakh do", "password hai Pak2026! naya karo", "set pwd = abc12345xyz"]) {
      const answer = await askAssistant(spy, { message });
      expect(answer.reply).toMatch(/Password yahan mat likhein/);
      expect(answer.actions).toEqual([]);
    }
    expect(called).toBe(false);
    // Asking for a reset, without typing one, is fine.
    await askAssistant(spy, { message: "Sara ka password reset kar do" });
    expect(called).toBe(true);
  });

  it("refuses an empty or very long message, and works only with a real AI key", async () => {
    await expect(askAssistant(deps("{}"), { message: "   " })).rejects.toMatchObject({ status: 400 });
    await expect(askAssistant(deps("{}"), { message: "x".repeat(601) })).rejects.toMatchObject({ status: 400 });
    await expect(askAssistant(deps("{}", "mock"), { message: "hello" })).rejects.toMatchObject({ status: 503 });
  });

  it("proposes a late alert on an existing task, using the labels it was shown", async () => {
    const seen: { prompt?: string } = {};
    const answer = await askAssistant(deps('{"reply":"Alert ready","tasks":[],"alerts":[{"task":"T1","minutes":10}]}', "gemini", seen), { message: "remind me if Ali's Fred task is 10 minutes late" });
    expect(seen.prompt).toContain("T1: “Fred ke stores” (one-off, todo) for Ali Khan");
    expect(seen.prompt).toContain("T2: “Invoices” (one-off, todo) for Sara Ahmed");
    expect(seen.prompt).toContain("R1: “Open shop” for Ali Khan");
    expect(seen.prompt).toContain("L1: Sara Ahmed, leave");
    expect(seen.prompt).toContain("Omar Farooq (no business): TURNED OFF");
    expect(answer.proposals).toEqual([]);
    expect(answer.alerts).toEqual([expect.objectContaining({ taskId: "task-fred", taskTitle: "Fred ke stores", minutes: 10, issues: [] })]);
    expect(answer.reply).toBe("Alert ready");
  });

  it("flags an alert for a task that is not in the list instead of guessing", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[],"alerts":[{"task":"T7","minutes":10}]}'), { message: "alert me on some task" });
    expect(answer.alerts[0].taskId).toBe("");
    expect(answer.alerts[0].issues[0]).toMatch(/couldn't tell which task/);
    expect(answer.reply).toMatch(/^Yeh abhi nahi ho sakta: /);
  });

  it("turns a task for nobody into a note for the admin", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[{"title":"Check Fred stores task","date":"2026-11-18","time":"12:10"}],"alerts":[]}'), { message: "yaad dilana" });
    expect(answer.proposals[0]).toMatchObject({ dump: true, remindOn: "2026-11-18", assigneeIds: [], issues: [] });
  });

  it("flags a person who is not on the team instead of guessing", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[{"title":"Call bank","who":["Zoya"],"date":"2026-11-19"}]}'), { message: "Zoya call bank tomorrow" });
    expect(answer.proposals[0].issues[0]).toMatch(/No team member called/);
    expect(answer.proposals[0].assigneeIds).toEqual([]);
    expect(answer.reply).toMatch(/^Yeh abhi nahi ho sakta: /);
  });

  it("tells the AI it may only propose, never change anything", async () => {
    const seen: { system?: string } = {};
    await askAssistant(deps('{"tasks":[]}', "gemini", seen), { message: "hello" });
    expect(seen.system).toContain("You NEVER change anything yourself");
    expect(seen.system).toContain("Roman Urdu");
    // It is told what it cannot do, so a request like salary or an unlisted job is refused instead of becoming a task.
    expect(seen.system).toContain("Never turn them into a task");
    // And that a password is only ever typed on the card.
    expect(seen.system).toContain("NEVER ask for or write a password");
  });
});
