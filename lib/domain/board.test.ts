import { describe, expect, it } from "vitest";
import { columnTasks, filterTasks, groupLanes, NO_FILTERS, rangeFor, type BoardTask } from "@/lib/domain/board";

describe("rangeFor", () => {
  const wed = "2026-10-21";
  it("today is just today", () => expect(rangeFor("today", wed)).toEqual({ start: wed, end: wed }));
  it("the week runs Monday to Sunday", () => {
    expect(rangeFor("week", wed)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(rangeFor("week", "2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Sunday
    expect(rangeFor("week", "2026-10-19")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Monday
  });
  it("last 7 and last 30 days include today", () => {
    expect(rangeFor("last7", wed)).toEqual({ start: "2026-10-15", end: wed });
    expect(rangeFor("last30", wed)).toEqual({ start: "2026-09-22", end: wed });
  });
  it("crosses month and year boundaries", () => {
    expect(rangeFor("last7", "2026-01-03")).toEqual({ start: "2025-12-28", end: "2026-01-03" });
  });
});

const t = (id: string, over: Partial<BoardTask> = {}): BoardTask => ({
  id, status: "todo", priority: "medium", title: id, businessId: "b1", assigneeIds: ["ali"], assigneeNames: { ali: "Ali Khan" }, dueAtMs: null, ...over,
});

describe("filterTasks", () => {
  const tasks = [
    t("Count stock", { priority: "high" }),
    t("Cash up", { businessId: "b2", assigneeIds: ["sara"], assigneeNames: { sara: "Sara" } }),
    t("Audit", { assigneeIds: ["ali", "sara"], assigneeNames: { ali: "Ali Khan", sara: "Sara" } }),
  ];
  const ids = (f: Partial<typeof NO_FILTERS>) => filterTasks(tasks, { ...NO_FILTERS, ...f }).map((x) => x.id);

  it("no filters keeps everything", () => expect(ids({})).toEqual(["Count stock", "Cash up", "Audit"]));
  it("filters by priority, business and employee (incl. shared tasks)", () => {
    expect(ids({ priority: "high" })).toEqual(["Count stock"]);
    expect(ids({ businessId: "b2" })).toEqual(["Cash up"]);
    expect(ids({ employeeId: "sara" })).toEqual(["Cash up", "Audit"]);
  });
  it("searches titles and assignee names, case-insensitively", () => {
    expect(ids({ search: "CASH" })).toEqual(["Cash up"]);
    expect(ids({ search: "khan" })).toEqual(["Count stock", "Audit"]);
  });
  it("combines filters", () => expect(ids({ employeeId: "sara", businessId: "b1" })).toEqual(["Audit"]));
});

describe("groupLanes", () => {
  const tasks = [
    t("a", { businessId: "b2" }),
    t("b", { assigneeIds: ["ali", "sara"], assigneeNames: { ali: "Ali Khan", sara: "Sara" } }),
  ];
  const labels = { business: (id: string) => (id === "b1" ? "Alpha" : "Beta") };

  it("none gives one lane with everything", () => {
    expect(groupLanes(tasks, "none", labels)).toEqual([{ key: "all", label: "", tasks }]);
  });
  it("by employee puts shared tasks in each person's lane, sorted by name", () => {
    const lanes = groupLanes(tasks, "employee", labels);
    expect(lanes.map((l) => [l.label, l.tasks.map((x) => x.id)])).toEqual([["Ali Khan", ["a", "b"]], ["Sara", ["b"]]]);
  });
  it("by business groups by business name", () => {
    expect(groupLanes(tasks, "business", labels).map((l) => [l.label, l.tasks.map((x) => x.id)])).toEqual([["Alpha", ["b"]], ["Beta", ["a"]]]);
  });
});

describe("columnTasks", () => {
  it("returns one status, urgent first", () => {
    const tasks = [t("low", { priority: "low" }), t("high", { priority: "high" }), t("done", { status: "completed" })];
    expect(columnTasks(tasks, "todo").map((x) => x.id)).toEqual(["high", "low"]);
  });
});
