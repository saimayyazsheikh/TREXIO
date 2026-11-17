import { describe, expect, it } from "vitest";
import { buildAssistantPrompt, fixKeys, matchPerson, parseAssistantReply, resolveAlerts, resolveProposals, upcomingDays, type AssistantOpenTask, type AssistantPerson } from "@/lib/domain/assistant";

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
    expect(parseAssistantReply('{"reply":"Sara has room","tasks":[]}')).toEqual({ reply: "Sara has room", tasks: [], alerts: [], actions: [] });
  });
});

describe("a misspelled field name", () => {
  it("is read as the field it nearly is, instead of silently dropping what was said", () => {
    const r = parseAssistantReply('{"reply":"x","actions":[{"kind":"task.update","task":"T1","assigness":["Sara"],"priorty":"low"}],"taks":[{"title":"A task","whoo":["Ali"]}]}');
    expect(r?.actions[0]).toMatchObject({ assignees: ["Sara"], priority: "low" });
    // "taks" at the top is read as "tasks" too.
    expect(r?.tasks.map((t) => t.title)).toEqual(["A task"]);
  });

  it("leaves a key alone when it is unknown, or could be two different ones", () => {
    expect(fixKeys({ banana: 1, who: 2 }, ["who", "person"])).toEqual({ banana: 1, who: 2 });
    expect(fixKeys({ aaaa: 1 }, ["aaab", "aaac"])).toEqual({ aaaa: 1 });
    // A key that is already right is never renamed, and a rename never overwrites a real one.
    expect(fixKeys({ assignees: 1, assigness: 2 }, ["assignees"])).toEqual({ assignees: 1, assigness: 2 });
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
  const raw = (tasks: object[]) => ({ reply: "", tasks: tasks as never, alerts: [], actions: [] });

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

  it("keeps the day of a note for the admin as a reminder day, and drops one that has passed", () => {
    const [future, past] = resolveProposals(raw([{ title: "Check paint stock", date: "2026-11-20" }, { title: "Old note", date: "2026-11-01" }]), { people, today });
    expect(future).toMatchObject({ dump: true, date: null, remindOn: "2026-11-20", issues: [] });
    expect(past).toMatchObject({ dump: true, remindOn: null, issues: [] });
  });

  it("never proposes a task for nobody: with no person named it becomes a note for the admin", () => {
    const [p] = resolveProposals(raw([{ title: "Saim ka Fred ke stores wala task check karna", date: today, time: "12:10" }]), { people, today });
    expect(p).toMatchObject({ dump: true, date: null, remindOn: today, dueTime: "", assigneeIds: [], issues: [] });
  });

  it("flags a day that has passed, an unknown or ambiguous person", () => {
    const [past, unknown, ambiguous] = resolveProposals(
      raw([
        { title: "Old", who: ["Sara"], date: "2026-11-01" },
        { title: "Who", who: ["Zoya"], date: "2026-11-19" },
        { title: "Two", who: ["Ali"], date: "2026-11-19" },
      ]),
      { people, today },
    );
    expect(past.issues).toEqual(["That day has already passed"]);
    expect(unknown.issues[0]).toMatch(/No team member called/);
    expect(ambiguous.issues[0]).toMatch(/Which one/);
  });

  it("ignores a bad time and an unknown priority", () => {
    const [p] = resolveProposals(raw([{ title: "Call bank", who: ["Sara"], time: "5pm", priority: "urgent" }]), { people, today });
    expect(p).toMatchObject({ dueTime: "", priority: "medium" });
  });
});

describe("resolveAlerts", () => {
  const open: AssistantOpenTask[] = [
    { ref: "T1", id: "task-a", title: "Fred ke stores", assigneeNames: ["Saim Ali"], date: "2026-11-18", dueTime: "12:00" },
    { ref: "T2", id: "task-b", title: "Invoices", assigneeNames: ["Sara Ahmed"], date: "2026-11-19", dueTime: "17:00" },
  ];
  const raw = (alerts: object[]) => ({ reply: "", tasks: [], alerts: alerts as never, actions: [] });

  it("matches a label to the task it stands for", () => {
    const [a] = resolveAlerts(raw([{ task: "t1", minutes: 10 }]), open);
    expect(a).toMatchObject({ taskId: "task-a", taskTitle: "Fred ke stores", assigneeNames: ["Saim Ali"], minutes: 10, issues: [], dueLabel: "Wed 11-18 12:00" });
  });

  it("flags a task that has no due time", () => {
    const [a] = resolveAlerts(raw([{ task: "T3", minutes: 10 }]), [...open, { ref: "T3", id: "task-c", title: "Cleaning", assigneeNames: [], date: "2026-11-18", dueTime: "" }]);
    expect(a.issues).toEqual(["This task has no due time, so there is nothing to be late for."]);
  });

  it("uses 10 minutes when none was given, and rounds", () => {
    expect(resolveAlerts(raw([{ task: "T2" }]), open)[0].minutes).toBe(10);
    expect(resolveAlerts(raw([{ task: "T2", minutes: 14.6 }]), open)[0].minutes).toBe(15);
  });

  it("flags a task that is not in the list, and minutes outside 5 minutes to 24 hours", () => {
    const [unknown, tooShort, tooLong] = resolveAlerts(raw([{ task: "T9", minutes: 10 }, { task: "T1", minutes: 2 }, { task: "T1", minutes: 5000 }]), open);
    expect(unknown.issues[0]).toMatch(/couldn't tell which task/);
    expect(unknown.taskId).toBe("");
    expect(tooShort.issues[0]).toMatch(/Pick between 5 minutes and 24 hours/);
    expect(tooLong.issues[0]).toMatch(/Pick between 5 minutes and 24 hours/);
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
    expect(prompt).toContain("(none)");
  });

  it("lists the open tasks under short labels so the assistant can point at one", () => {
    const prompt = buildAssistantPrompt({
      message: "alert me",
      today,
      people,
      businesses: [],
      loads: [],
      tasks: [{ ref: "T1", id: "x", title: "Fred ke stores", kind: "oneoff", assigneeNames: ["Saim Ali"], date: "2026-11-18", dueTime: "12:00", priority: "high", status: "todo" }],
      routines: [{ ref: "R1", id: "r", title: "Open shop", employeeName: "Ali", dueTime: "09:00", activeDays: [1, 2, 3], active: false }],
      leaves: [{ ref: "L1", id: "l", employeeName: "Sara", kind: "leave", fromDate: "2026-11-20", toDate: "2026-11-21", reason: "Wedding" }],
    });
    expect(prompt).toContain("T1: “Fred ke stores” (one-off, todo) for Saim Ali, high priority, Wed 2026-11-18 due 12:00");
    expect(prompt).toContain("R1: “Open shop” for Ali, days 123, due 09:00, paused");
    expect(prompt).toContain("L1: Sara, leave, 2026-11-20 to 2026-11-21, “Wedding”");
    expect(prompt).toContain("Ali Raza (no business): no figures");
  });
});
