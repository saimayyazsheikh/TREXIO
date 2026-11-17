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
    expect(answer).toEqual({ reply: "Sara has the most room.", proposals: [] });
  });

  it("asks the admin to rephrase when the AI sends something unreadable", async () => {
    const answer = await askAssistant(deps("Sorry, I cannot do that."), { message: "asdf" });
    expect(answer.proposals).toEqual([]);
    expect(answer.reply).toMatch(/couldn't turn that into tasks/);
  });

  it("refuses an empty or very long message, and works only with a real AI key", async () => {
    await expect(askAssistant(deps("{}"), { message: "   " })).rejects.toMatchObject({ status: 400 });
    await expect(askAssistant(deps("{}"), { message: "x".repeat(601) })).rejects.toMatchObject({ status: 400 });
    await expect(askAssistant(deps("{}", "mock"), { message: "hello" })).rejects.toMatchObject({ status: 503 });
  });

  it("flags a person who is not on the team instead of guessing", async () => {
    const answer = await askAssistant(deps('{"reply":"","tasks":[{"title":"Call bank","who":["Zoya"],"date":"2026-11-19"}]}'), { message: "Zoya call bank tomorrow" });
    expect(answer.proposals[0].issues[0]).toMatch(/No team member called/);
    expect(answer.proposals[0].assigneeIds).toEqual([]);
    expect(answer.reply).toMatch(/1 task/);
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
