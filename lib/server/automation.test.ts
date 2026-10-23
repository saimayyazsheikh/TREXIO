import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AutomationSettings } from "@/lib/domain/automation";
import type { TaskData } from "@/lib/domain/tasks";
import { runBriefing, runEscalations, type AutomationDeps } from "@/lib/server/automation";
import type { Notice } from "@/lib/server/communication";
import type { WaMessage } from "@/lib/server/whatsapp";

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
  people: Record<string, { name: string; status: "active" | "disabled"; businessId: string | null; phone: string | null }>;
  businesses: Record<string, { name: string; active: boolean; workDays: number[] }>;
  runs: Set<string>;
  notices: Notice[];
  sent: WaMessage[];
  failWhatsApp: boolean;
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
  sendWhatsApp: async (m) => {
    if (w.failWhatsApp) throw new Error("boom");
    w.sent.push(m);
  },
});

beforeEach(() => {
  w = {
    tasks: new Map([["t1", task()]]),
    settings: { ...DEFAULT_SETTINGS, adminPhone: "+923009999999" },
    calendar: [],
    leave: new Set(),
    people: {
      ali: { name: "Ali Khan", status: "active", businessId: "b1", phone: "+923001111111" },
      sara: { name: "Sara Ahmed", status: "active", businessId: "b1", phone: null },
    },
    businesses: { b1: { name: "Alpha Traders", active: true, workDays: [1, 2, 3, 4, 5, 6] } },
    runs: new Set(),
    notices: [],
    sent: [],
    failWhatsApp: false,
  };
});

describe("runEscalations", () => {
  it("level 1 tells the assignee in the app once it is an hour late", async () => {
    const r = await runEscalations(deps());
    expect(r).toMatchObject({ level1: 1, level2: 0 });
    expect(w.notices).toEqual([expect.objectContaining({ toUid: "ali", title: "A task is running late", link: "/me" })]);
    expect(w.tasks.get("t1")!.escalation.l1At).toEqual(now);
    expect(w.sent).toHaveLength(0);
  });

  it("each level fires once even when the job runs again", async () => {
    await runEscalations(deps());
    await runEscalations(deps());
    expect(w.notices).toHaveLength(1);
  });

  it("level 2 tells the admin in the app and on WhatsApp", async () => {
    w.tasks.set("t1", task({ dueAt: dueAgo(200) }));
    const r = await runEscalations(deps());
    expect(r).toMatchObject({ level1: 1, level2: 1 });
    expect(w.notices.map((n) => n.toUid).sort()).toEqual(["admin", "ali"]);
    expect(w.sent[0]).toMatchObject({ kind: "escalation", to: "+923009999999", taskId: "t1" });
    expect(w.sent[0].text).toContain("Count stock");
    expect(w.sent[0].text).toContain("Ali Khan");
  });

  it("with no admin number the admin is still told in the app", async () => {
    w.settings = { ...DEFAULT_SETTINGS };
    w.tasks.set("t1", task({ dueAt: dueAgo(200) }));
    await runEscalations(deps());
    expect(w.notices.some((n) => n.toUid === "admin")).toBe(true);
    expect(w.sent).toHaveLength(0);
  });

  it("a WhatsApp failure is counted and doesn't stop the run", async () => {
    w.failWhatsApp = true;
    w.tasks.set("t1", task({ dueAt: dueAgo(200) }));
    w.tasks.set("t2", task({ dueAt: dueAgo(90), title: "Other" }));
    const r = await runEscalations(deps());
    expect(r.whatsappFailed).toBe(1);
    expect(r.level1).toBe(2);
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
  beforeEach(() => {
    w.people.sara.phone = "+923002222222";
    w.tasks = new Map([
      ["a", task({ title: "Open shop", dueAt: new Date("2026-10-21T04:30:00Z") })],
      ["b", task({ title: "Cash up", dueAt: new Date("2026-10-21T12:45:00Z") })],
      ["c", task({ title: "Sara's job", assigneeIds: ["sara"], assigneeNames: { sara: "Sara Ahmed" }, completion: { sara: { done: false, at: null } } })],
      ["d", task({ title: "Already done", status: "completed" })],
    ]);
  });

  it("sends each person their open tasks in due order, once", async () => {
    const r = await runBriefing(deps());
    expect(r).toMatchObject({ sent: 2, failed: 0 });
    const ali = w.sent.find((m) => m.toUid === "ali")!;
    expect(ali.kind).toBe("briefing");
    expect(ali.text).toContain("2 tasks");
    expect(ali.text.indexOf("Open shop")).toBeLessThan(ali.text.indexOf("Cash up"));
    expect(ali.text).not.toContain("Already done");
    expect(await runBriefing(deps())).toMatchObject({ sent: 0 });
    expect(w.sent).toHaveLength(2);
  });

  it("is off when the setting is off", async () => {
    w.settings = { ...DEFAULT_SETTINGS, briefingEnabled: false };
    expect(await runBriefing(deps())).toEqual({ eligible: 0, sent: 0, skipped: 0, failed: 0 });
    expect(w.sent).toHaveLength(0);
  });

  it("skips holidays, closures, leave, non-working days, and people with no number", async () => {
    w.calendar = [{ date: "2026-10-21", businessId: null }];
    expect(await runBriefing(deps())).toMatchObject({ sent: 0 });
    w.calendar = [];
    w.leave = new Set(["ali"]);
    w.people.sara.phone = null;
    expect(await runBriefing(deps())).toMatchObject({ sent: 0, eligible: 1 });
    w.leave = new Set();
    w.businesses.b1.workDays = [1, 2, 4, 5, 6, 7]; // no Wednesday
    expect(await runBriefing(deps())).toMatchObject({ sent: 0, eligible: 0 });
  });

  it("a failed send is counted, and one failure doesn't block the others", async () => {
    w.failWhatsApp = true;
    expect(await runBriefing(deps())).toMatchObject({ sent: 0, failed: 2 });
  });

  it("an empty day still gets a friendly message", async () => {
    w.tasks = new Map();
    await runBriefing(deps());
    expect(w.sent[0].text).toContain("nothing assigned");
  });
});
