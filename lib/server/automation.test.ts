import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AutomationSettings } from "@/lib/domain/automation";
import type { TaskData } from "@/lib/domain/tasks";
import { runBriefing, runEscalations, type AutomationDeps } from "@/lib/server/automation";
import type { Notice } from "@/lib/server/communication";

const MIN = 60_000;
const now = new Date("2026-10-21T08:00:00Z"); // 13:00 PKT, Wednesday
const dueAgo = (min: number) => new Date(now.getTime() - min * MIN);

const task = (o: Partial<TaskData> = {}): TaskData =>
  ({
    kind: "oneoff", templateId: null, date: "2026-10-21", businessId: "b1", assigneeIds: ["ali"], assigneeNames: { ali: "Ali Khan" }, completion: { ali: { done: false, at: null } },
    completionMode: "all", title: "Count stock", description: "", priority: "medium", status: "todo", blockedReason: null, blockedBy: null, dueAt: dueAgo(70),
    escalation: { l1At: null, l2At: null }, ...o,
  }) as TaskData;

type World = {
  tasks: Map<string, TaskData>;
  settings: AutomationSettings;
  calendar: { date: string; businessId: string | null }[];
  leave: Set<string>;
  people: Record<string, { name: string; status: "active" | "disabled"; businessId: string | null }>;
  businesses: Record<string, { name: string; active: boolean; workDays: number[] }>;
  runs: Set<string>;
  notices: Notice[];
};
let w: World;

const deps = (): AutomationDeps => ({
  now: () => now,
  loadSettings: async () => w.settings,
  loadDueBetween: async (from, to) => [...w.tasks].filter(([, t]) => t.dueAt && t.dueAt.getTime() >= from && t.dueAt.getTime() <= to).map(([id, task]) => ({ id, task })),
  loadTasksOnDate: async (date) => [...w.tasks].filter(([, t]) => t.date === date).map(([id, task]) => ({ id, task })),
  loadCalendar: async () => w.calendar,
  loadEmployeesOnLeave: async () => w.leave,
  loadPeople: async (ids) => new Map(ids.flatMap((id) => (w.people[id] ? [[id, w.people[id]] as const] : []))),
  loadActiveEmployees: async () => Object.entries(w.people).filter(([, p]) => p.status === "active").map(([id, person]) => ({ id, person })),
  loadBusinesses: async (ids) => new Map(ids.flatMap((id) => (w.businesses[id] ? [[id, w.businesses[id]] as const] : []))),
  claimEscalation: async (id, level, at) => {
    const t = w.tasks.get(id)!;
    const key = level === 1 ? "l1At" : "l2At";
    if (t.escalation[key]) return false;
    t.escalation = { ...t.escalation, [key]: at };
    return true;
  },
  claimRun: async (key) => (w.runs.has(key) ? false : (w.runs.add(key), true)),
  notify: async (n) => void w.notices.push(n),
});

beforeEach(() => {
  w = {
    tasks: new Map([["t1", task()]]),
    settings: { ...DEFAULT_SETTINGS },
    calendar: [],
    leave: new Set(),
    people: {
      ali: { name: "Ali Khan", status: "active", businessId: "b1" },
      sara: { name: "Sara Ahmed", status: "active", businessId: "b1" },
    },
    businesses: { b1: { name: "Alpha Traders", active: true, workDays: [1, 2, 3, 4, 5, 6] } },
    runs: new Set(),
    notices: [],
  };
});

describe("runEscalations", () => {
  it("level 1 tells the assignee in the app once it is an hour late", async () => {
    const r = await runEscalations(deps());
    expect(r).toMatchObject({ level1: 1, level2: 0 });
    expect(w.notices).toEqual([expect.objectContaining({ toUid: "ali", title: "A task is running late", link: "/me" })]);
    expect(w.tasks.get("t1")!.escalation.l1At).toEqual(now);
  });

  it("each level fires once even when the job runs again", async () => {
    await runEscalations(deps());
    await runEscalations(deps());
    expect(w.notices).toHaveLength(1);
  });

  it("level 2 tells the admin in the app, naming the task and the person", async () => {
    w.tasks.set("t1", task({ dueAt: dueAgo(200) }));
    const r = await runEscalations(deps());
    expect(r).toMatchObject({ level1: 1, level2: 1 });
    expect(w.notices.map((n) => n.toUid).sort()).toEqual(["admin", "ali"]);
    const adminNotice = w.notices.find((n) => n.toUid === "admin")!;
    expect(adminNotice).toMatchObject({ title: "A task is badly late", link: "/admin/kanban" });
    expect(adminNotice.body).toContain("Count stock");
    expect(adminNotice.body).toContain("Ali Khan");
  });

  it("pauses on a holiday, a closure of that business, and for people on leave", async () => {
    w.calendar = [{ date: "2026-10-21", businessId: null }];
    expect(await runEscalations(deps())).toMatchObject({ level1: 0, paused: 1 });
    w.calendar = [{ date: "2026-10-21", businessId: "other" }];
    expect(await runEscalations(deps())).toMatchObject({ level1: 1 });
    w.tasks.set("t1", task());
    w.calendar = [{ date: "2026-10-21", businessId: "b1" }];
    expect(await runEscalations(deps())).toMatchObject({ level1: 0, paused: 1 });
    w.calendar = [];
    w.leave = new Set(["ali"]);
    expect(await runEscalations(deps())).toMatchObject({ level1: 0, paused: 1 });
    expect(w.tasks.get("t1")!.escalation.l1At).toBeNull(); // not flagged, so it can still fire when they're back
  });

  it("skips finished, blocked and not-yet-late tasks, and those a person already ticked", async () => {
    w.tasks = new Map([
      ["done", task({ status: "completed" })],
      ["blocked", task({ status: "blocked" })],
      ["early", task({ dueAt: dueAgo(30) })],
      ["ticked", task({ completion: { ali: { done: true, at: now } } })],
    ]);
    const r = await runEscalations(deps());
    expect(r).toMatchObject({ level1: 0, level2: 0 });
    expect(w.notices).toHaveLength(0);
  });

  it("alerts only the people who still owe work on a shared task", async () => {
    w.tasks.set("t1", task({ assigneeIds: ["ali", "sara"], completion: { ali: { done: true, at: now }, sara: { done: false, at: null } } }));
    await runEscalations(deps());
    expect(w.notices.map((n) => n.toUid)).toEqual(["sara"]);
  });

  it("uses the thresholds from settings", async () => {
    w.settings = { ...DEFAULT_SETTINGS, escalationL1Min: 120, escalationL2Min: 300 };
    expect(await runEscalations(deps())).toMatchObject({ level1: 0 });
    w.settings = { ...DEFAULT_SETTINGS, escalationL1Min: 30, escalationL2Min: 60 };
    expect(await runEscalations(deps())).toMatchObject({ level1: 1, level2: 1 });
  });
});

describe("runBriefing", () => {
  const forUser = (uid: string) => w.notices.filter((n) => n.toUid === uid);
  beforeEach(() => {
    w.tasks = new Map([
      ["a", task({ title: "Open shop", dueAt: new Date("2026-10-21T04:30:00Z") })],
      ["b", task({ title: "Cash up", dueAt: new Date("2026-10-21T12:45:00Z") })],
      ["c", task({ title: "Sara's job", assigneeIds: ["sara"], assigneeNames: { sara: "Sara Ahmed" }, completion: { sara: { done: false, at: null } } })],
      ["d", task({ title: "Already done", status: "completed" })],
    ]);
  });

  it("tells each person their open tasks in due order, once", async () => {
    const r = await runBriefing(deps());
    expect(r).toMatchObject({ sent: 2, failed: 0 });
    const [ali] = forUser("ali");
    expect(ali).toMatchObject({ title: "Good morning! 2 tasks today", link: "/me" });
    expect(ali.body.indexOf("Open shop")).toBeLessThan(ali.body.indexOf("Cash up"));
    expect(ali.body).not.toContain("Already done");
    expect(forUser("sara")[0]).toMatchObject({ title: "Good morning! 1 task today", body: "Sara's job" });
    expect(await runBriefing(deps())).toMatchObject({ sent: 0 });
    expect(w.notices).toHaveLength(2);
  });

  it("lists three tasks and counts the rest", async () => {
    w.tasks = new Map(Array.from({ length: 5 }, (_, i) => [`t${i}`, task({ title: `Task ${i}`, dueAt: new Date(Date.UTC(2026, 9, 21, 5 + i)) })]));
    await runBriefing(deps());
    expect(forUser("ali")[0].body).toBe("Task 0, Task 1, Task 2 and 2 more");
  });

  it("is off when the setting is off", async () => {
    w.settings = { ...DEFAULT_SETTINGS, briefingEnabled: false };
    expect(await runBriefing(deps())).toEqual({ eligible: 0, sent: 0, skipped: 0, failed: 0 });
    expect(w.notices).toHaveLength(0);
  });

  it("skips holidays, closures, leave and non-working days", async () => {
    w.calendar = [{ date: "2026-10-21", businessId: null }];
    expect(await runBriefing(deps())).toMatchObject({ sent: 0 });
    w.calendar = [];
    w.leave = new Set(["ali"]);
    expect(await runBriefing(deps())).toMatchObject({ sent: 1, eligible: 1 });
    expect(forUser("ali")).toHaveLength(0);
    w.leave = new Set();
    w.businesses.b1.workDays = [1, 2, 4, 5, 6, 7]; // no Wednesday
    expect(await runBriefing(deps())).toMatchObject({ sent: 0, eligible: 0 });
  });

  it("an empty day still gets a friendly message", async () => {
    w.tasks = new Map();
    await runBriefing(deps());
    expect(forUser("ali")[0]).toMatchObject({ title: "Good morning! Nothing assigned yet" });
  });
});
