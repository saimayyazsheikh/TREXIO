import { beforeEach, describe, expect, it } from "vitest";
import { generateDailyTasks, type GenerationDeps } from "@/lib/server/daily-generation";
import type { TemplateData } from "@/lib/domain/task-builders";
import type { AuditEntry } from "@/lib/server/task-store";
import type { TaskData } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T00:10:00Z"); // 05:10 PKT, Wednesday 2026-10-21
const WED = "2026-10-21";
const SAT = "2026-10-24";

const tpl = (over: Partial<TemplateData> = {}): TemplateData => ({
  employeeId: "ali", businessId: "b1", title: "Server check", description: "", priority: "medium", dueTime: "10:00",
  subtasks: [{ id: "s1", title: "Backups" }], activeDays: [1, 2, 3, 4, 5, 6], active: true, order: 1, updatedAt: now, ...over,
});

type World = {
  templates: Map<string, TemplateData>;
  tasks: Map<string, TaskData>;
  audits: AuditEntry[];
  employees: Map<string, { status: "active" | "disabled"; businessId: string | null }>;
  businesses: Map<string, { active: boolean; workDays: number[] }>;
};

function makeDeps(w: World): GenerationDeps {
  return {
    now: () => now,
    loadTemplates: async (employeeId) => [...w.templates].filter(([, t]) => t.active && (!employeeId || t.employeeId === employeeId)).map(([id, data]) => ({ id, data })),
    loadEmployees: async (ids) => new Map(ids.filter((i) => w.employees.has(i)).map((i) => [i, w.employees.get(i)!])),
    loadBusinesses: async (ids) => new Map(ids.filter((i) => w.businesses.has(i)).map((i) => [i, w.businesses.get(i)!])),
    existingTaskIds: async (ids) => new Set(ids.filter((i) => w.tasks.has(i))),
    // Like Firestore `create`: never overwrites an existing document.
    createTasks: async (items) => {
      let n = 0;
      for (const { id, data } of items) {
        if (w.tasks.has(id)) continue;
        w.tasks.set(id, data);
        n++;
      }
      return n;
    },
    writeAudit: async (e) => void w.audits.push(e),
  };
}

describe("generateDailyTasks", () => {
  let w: World;
  beforeEach(() => {
    w = {
      templates: new Map([["t1", tpl()]]),
      tasks: new Map(),
      audits: [],
      employees: new Map([["ali", { status: "active", businessId: "b1" }]]),
      businesses: new Map([["b1", { active: true, workDays: [1, 2, 3, 4, 5, 6] }]]),
    };
  });

  it("creates one deterministic task per routine per day", async () => {
    const res = await generateDailyTasks(makeDeps(w), { date: WED });
    expect(res).toEqual({ considered: 1, created: 1, skipped: 0 });
    expect([...w.tasks.keys()]).toEqual([`t1_ali_${WED}`]);
    expect(w.tasks.get(`t1_ali_${WED}`)).toMatchObject({ kind: "daily", status: "todo", date: WED, assigneeIds: ["ali"], businessId: "b1", templateId: "t1" });
  });

  it("is idempotent: running again, or concurrently, creates no duplicates and keeps progress", async () => {
    const deps = makeDeps(w);
    await generateDailyTasks(deps, { date: WED });
    w.tasks.set(`t1_ali_${WED}`, { ...w.tasks.get(`t1_ali_${WED}`)!, status: "completed" });
    const again = await generateDailyTasks(deps, { date: WED });
    expect(again.created).toBe(0);
    expect(w.tasks.size).toBe(1);
    expect(w.tasks.get(`t1_ali_${WED}`)?.status).toBe("completed");

    w.tasks.clear();
    const [a, b] = await Promise.all([generateDailyTasks(deps, { date: WED }), generateDailyTasks(deps, { date: WED })]);
    expect(w.tasks.size).toBe(1);
    expect(a.created + b.created).toBeGreaterThanOrEqual(1);
  });

  it("writes a single audit entry per run that created something, and none for a no-op run", async () => {
    const deps = makeDeps(w);
    await generateDailyTasks(deps, { date: WED });
    await generateDailyTasks(deps, { date: WED });
    expect(w.audits).toHaveLength(1);
    expect(w.audits[0]).toMatchObject({ action: "task.generate", actorRole: "system", meta: { date: WED, created: 1 } });
  });

  it("skips days the routine or the business is closed", async () => {
    w.templates.set("t1", tpl({ activeDays: [1, 2, 3, 4, 5] }));
    expect((await generateDailyTasks(makeDeps(w), { date: SAT })).created).toBe(0); // routine off on Saturday
    w.templates.set("t1", tpl({ activeDays: [6] }));
    w.businesses.set("b1", { active: true, workDays: [1, 2, 3, 4, 5] });
    expect((await generateDailyTasks(makeDeps(w), { date: SAT })).created).toBe(0); // business closed on Saturday
    expect(w.tasks.size).toBe(0);
  });

  it("skips paused routines, inactive businesses and turned-off employees", async () => {
    w.templates.set("t1", tpl({ active: false }));
    expect((await generateDailyTasks(makeDeps(w), { date: WED })).created).toBe(0);
    w.templates.set("t1", tpl());
    w.businesses.set("b1", { active: false, workDays: [1, 2, 3, 4, 5, 6] });
    expect((await generateDailyTasks(makeDeps(w), { date: WED })).created).toBe(0);
    w.businesses.set("b1", { active: true, workDays: [1, 2, 3, 4, 5, 6] });
    w.employees.set("ali", { status: "disabled", businessId: "b1" });
    expect((await generateDailyTasks(makeDeps(w), { date: WED })).created).toBe(0);
  });

  it("uses the employee's current business, not the one stored on the routine", async () => {
    w.employees.set("ali", { status: "active", businessId: "b2" });
    w.businesses.set("b2", { active: true, workDays: [1, 2, 3, 4, 5, 6] });
    await generateDailyTasks(makeDeps(w), { date: WED });
    expect(w.tasks.get(`t1_ali_${WED}`)?.businessId).toBe("b2");
  });

  it("can generate for a single employee (the lazy dashboard path)", async () => {
    w.templates.set("t2", tpl({ employeeId: "sara" }));
    w.employees.set("sara", { status: "active", businessId: "b1" });
    const res = await generateDailyTasks(makeDeps(w), { date: WED, employeeId: "sara" });
    expect(res.created).toBe(1);
    expect([...w.tasks.keys()]).toEqual([`t2_sara_${WED}`]);
  });

  it("does nothing when there are no routines", async () => {
    w.templates.clear();
    expect(await generateDailyTasks(makeDeps(w), { date: WED })).toEqual({ considered: 0, created: 0, skipped: 0 });
  });
});
