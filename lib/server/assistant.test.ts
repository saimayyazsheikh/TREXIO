import { describe, expect, it } from "vitest";
import { askAssistant, type AssistantDeps } from "@/lib/server/assistant";
import type { AiProvider } from "@/lib/server/ai";

const now = new Date("2026-11-18T06:00:00Z");
const people = [
  { id: "ali", name: "Ali Khan", businessId: "b1", designation: "Cashier" },
  { id: "sara", name: "Sara Ahmed", businessId: "b1", designation: "" },
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
  loadOpenTasks: async () => [
    { id: "task-fred", title: "Fred ke stores", assigneeNames: ["Ali Khan"], date: "2026-11-18", dueTime: "12:00" },
    { id: "task-inv", title: "Invoices", assigneeNames: ["Sara Ahmed"], date: "2026-11-19", dueTime: "17:00" },
  ],
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
    expect(answer).toEqual({ reply: "Sara has the most room.", proposals: [], alerts: [] });
  });

  it("asks the admin to rephrase when the AI sends something unreadable", async () => {
    const answer = await askAssistant(deps("{ \"reply\": \"half a message"), { message: "asdf" });
    expect(answer.proposals).toEqual([]);
    expect(answer.alerts).toEqual([]);
    expect(answer.reply).toMatch(/couldn't understand that/);
  });

  it("shows the AI's own words when it answers in plain text instead of the expected format", async () => {
    const answer = await askAssistant(deps("Which task do you mean? I see Cash up and Invoices."), { message: "alert me if the bank task is late" });
    expect(answer).toEqual({ reply: "Which task do you mean? I see Cash up and Invoices.", proposals: [], alerts: [] });
  });

  it("refuses an empty or very long message, and works only with a real AI key", async () => {
    await expect(askAssistant(deps("{}"), { message: "   " })).rejects.toMatchObject({ status: 400 });
    await expect(askAssistant(deps("{}"), { message: "x".repeat(601) })).rejects.toMatchObject({ status: 400 });
    await expect(askAssistant(deps("{}", "mock"), { message: "hello" })).rejects.toMatchObject({ status: 503 });
  });

  it("proposes a late alert on an existing task, using the labels it was shown", async () => {
    const seen: { prompt?: string } = {};
    const answer = await askAssistant(deps('{"reply":"Alert ready","tasks":[],"alerts":[{"task":"T1","minutes":10}]}', "gemini", seen), { message: "remind me if Ali's Fred task is 10 minutes late" });
    expect(seen.prompt).toContain("T1: “Fred ke stores” for Ali Khan, due Wed 2026-11-18 12:00");
    expect(seen.prompt).toContain("T2: “Invoices” for Sara Ahmed");
    expect(answer.proposals).toEqual([]);
    expect(answer.alerts).toEqual([expect.objectContaining({ taskId: "task-fred", taskTitle: "Fred ke stores", minutes: 10, issues: [] })]);
    expect(answer.reply).toBe("Alert ready");
  });

  it("flags an alert for a task that is not in the list instead of guessing", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[],"alerts":[{"task":"T7","minutes":10}]}'), { message: "alert me on some task" });
    expect(answer.alerts[0].taskId).toBe("");
    expect(answer.alerts[0].issues[0]).toMatch(/couldn't tell which task/);
    expect(answer.reply).toMatch(/1 thing/);
  });

  it("turns a task for nobody into a note for the admin", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[{"title":"Check Fred stores task","date":"2026-11-18","time":"12:10"}],"alerts":[]}'), { message: "yaad dilana" });
    expect(answer.proposals[0]).toMatchObject({ dump: true, remindOn: "2026-11-18", assigneeIds: [], issues: [] });
  });

  it("flags a person who is not on the team instead of guessing", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[{"title":"Call bank","who":["Zoya"],"date":"2026-11-19"}]}'), { message: "Zoya call bank tomorrow" });
    expect(answer.proposals[0].issues[0]).toMatch(/No team member called/);
    expect(answer.proposals[0].assigneeIds).toEqual([]);
    expect(answer.reply).toMatch(/1 thing/);
  });

  it("tells the AI it may only propose, never change anything", async () => {
    const seen: { system?: string } = {};
    await askAssistant(deps('{"tasks":[]}', "gemini", seen), { message: "hello" });
    expect(seen.system).toContain("You never change anything yourself");
    expect(seen.system).toContain("Roman Urdu");
    // It is also told what it cannot do, so a request like "add an employee" is refused instead of becoming a task.
    expect(seen.system).toContain("You can NOT add, remove or change employees");
    expect(seen.system).toContain("Never turn such a request into a task");
  });
});
