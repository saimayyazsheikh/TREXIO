import { describe, expect, it } from "vitest";
import { compareTasks } from "@/lib/domain/task-sort";

const t = (title: string, over: Partial<Parameters<typeof compareTasks>[0]> = {}) => ({ title, status: "todo" as const, priority: "medium" as const, dueAtMs: null, ...over });
const order = (items: ReturnType<typeof t>[]) => [...items].sort(compareTasks).map((i) => i.title);

describe("compareTasks", () => {
  it("puts completed tasks last", () => {
    expect(order([t("done", { status: "completed", priority: "high" }), t("open", { priority: "low" })])).toEqual(["open", "done"]);
  });
  it("orders by due time (earliest first, untimed last), then priority, then title", () => {
    expect(
      order([
        t("c", { priority: "low" }),
        t("b", { dueAtMs: 2000 }),
        t("a", { dueAtMs: 1000, priority: "low" }),
        t("z-untimed"),
        t("h", { priority: "high" }),
      ]),
    ).toEqual(["a", "b", "h", "z-untimed", "c"]);
  });
  it("breaks equal times by priority", () => {
    expect(order([t("low", { dueAtMs: 1000, priority: "low" }), t("high", { dueAtMs: 1000, priority: "high" })])).toEqual(["high", "low"]);
  });
  it("breaks ties alphabetically", () => {
    expect(order([t("beta"), t("alpha")])).toEqual(["alpha", "beta"]);
  });
});
