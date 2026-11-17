import { describe, expect, it } from "vitest";
import { buildAssistantPrompt, matchPerson, parseAssistantReply, resolveProposals, upcomingDays, type AssistantPerson } from "@/lib/domain/assistant";

const today = "2026-11-18";
const people: AssistantPerson[] = [
  { id: "ali", name: "Ali Khan", businessId: "b1", designation: "Cashier" },
  { id: "ali2", name: "Ali Raza", businessId: "b2", designation: "" },
  { id: "sara", name: "Sara Ahmed", businessId: "b1", designation: "Accountant" },
];

describe("parseAssistantReply", () => {
  it("reads plain JSON, JSON in code fences, and JSON after chatter", () => {
    const json = '{"reply":"Done","tasks":[{"title":"Count stock","who":["Sara"]}]}';
    expect(parseAssistantReply(json)?.tasks[0].title).toBe("Count stock");
    expect(parseAssistantReply("```json\n" + json + "\n```")?.reply).toBe("Done");
    expect(parseAssistantReply("Sure! Here you go: " + json + " Hope that helps")?.tasks).toHaveLength(1);
  });

  it("gives up on anything that is not a valid reply", () => {
    expect(parseAssistantReply("I cannot help")).toBeNull();
    expect(parseAssistantReply("{ not json }")).toBeNull();
    expect(parseAssistantReply('{"tasks":[{"title":""}]}')).toBeNull();
    expect(parseAssistantReply(`{"tasks":${JSON.stringify(Array.from({ length: 11 }, () => ({ title: "x" })))}}`)).toBeNull();
  });

  it("accepts a reply with only text, for questions", () => {
    expect(parseAssistantReply('{"reply":"Sara has room","tasks":[]}')).toEqual({ reply: "Sara has room", tasks: [] });
  });
});

describe("matchPerson", () => {
  it("matches a full name, or a first name only one person has", () => {
    expect(matchPerson("Sara", people).person?.id).toBe("sara");
    expect(matchPerson("ali khan", people).person?.id).toBe("ali");
  });
  it("does not take a surname alone for a colleague", () => {
    expect(matchPerson("Ahmed", people).problem).toMatch(/No team member called/);
    expect(matchPerson("Khan", people).problem).toMatch(/No team member called/);
  });
  it("says so when a name is ambiguous or unknown", () => {
    expect(matchPerson("Ali", people).problem).toMatch(/Which one: Ali Khan or Ali Raza/);
    expect(matchPerson("Zoya", people).problem).toMatch(/No team member called/);
  });
});

describe("resolveProposals", () => {
  const raw = (tasks: object[]) => ({ reply: "", tasks: tasks as never });

  it("puts a task with a person and no day on today, and defaults the priority", () => {
    const [p] = resolveProposals(raw([{ title: "Count stock", who: ["Sara"] }]), { people, today });
    expect(p).toMatchObject({ date: today, assigneeIds: ["sara"], priority: "medium", dump: false, issues: [] });
  });

  it("keeps the day, time and priority the assistant gave", () => {
    const [p] = resolveProposals(raw([{ title: "Invoices", who: ["Sara Ahmed"], date: "2026-11-20", time: "17:30", priority: "high", steps: ["Send", "Check"] }]), { people, today });
    expect(p).toMatchObject({ date: "2026-11-20", dueTime: "17:30", priority: "high", steps: ["Send", "Check"] });
  });

  it("turns a note with no person and no day into a dump entry", () => {
    const [p] = resolveProposals(raw([{ title: "Ask about paint" }]), { people, today });
    expect(p).toMatchObject({ dump: true, date: null, issues: [] });
  });

  it("flags a day that has passed, an unknown or ambiguous person, and a missing person", () => {
    const [past, unknown, ambiguous, nobody] = resolveProposals(
      raw([
        { title: "Old", who: ["Sara"], date: "2026-11-01" },
        { title: "Who", who: ["Zoya"], date: "2026-11-19" },
        { title: "Two", who: ["Ali"], date: "2026-11-19" },
        { title: "Nobody", date: "2026-11-19" },
      ]),
      { people, today },
    );
    expect(past.issues).toEqual(["That day has already passed"]);
    expect(unknown.issues[0]).toMatch(/No team member called/);
    expect(ambiguous.issues[0]).toMatch(/Which one/);
    expect(nobody.issues).toEqual(["Choose who it is for"]);
  });

  it("ignores a bad time and an unknown priority", () => {
    const [p] = resolveProposals(raw([{ title: "Call bank", who: ["Sara"], time: "5pm", priority: "urgent" }]), { people, today });
    expect(p).toMatchObject({ dueTime: "", priority: "medium" });
  });
});

describe("the prompt", () => {
  it("gives the assistant a real calendar and the team's figures", () => {
    const days = upcomingDays(today);
    expect(days[0]).toBe("Wed 2026-11-18 (today)");
    expect(days[1]).toBe("Thu 2026-11-19 (tomorrow)");
    expect(days).toHaveLength(21);
    const prompt = buildAssistantPrompt({
      message: "kal Sara ko invoices dena",
      today,
      people,
      businesses: [{ id: "b1", name: "Alpha" }],
      loads: [{ personId: "sara", open: 3, overdue: 1, today: 2, away: false }],
    });
    expect(prompt).toContain("Sara Ahmed (Alpha, Accountant): 3 open, 1 overdue, 2 due today");
    expect(prompt).toContain("kal Sara ko invoices dena");
    expect(prompt).toContain("Ali Raza (no business): no figures");
  });
});
