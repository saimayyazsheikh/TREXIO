import { describe, expect, it } from "vitest";
import { compareTasks } from "@/lib/domain/task-sort";

const t = (title: string, over: Partial<Parameters<typeof compareTasks>[0]> = {}) => ({ title, status: "todo" as const, priority: "medium" as const, dueAtMs: null, ...over });
const order = (items: ReturnType<typeof t>[]) => [...items].sort(compareTasks).map((i) => i.title);

describe("compareTasks", () => {
  it("puts completed tasks last", () => {
    expect(order([t("done", { status: "completed", priority: "high" }), t("open", { priority: "low" })])).toEqual(["open", "done"]);
  });
  it("orders by priority, then due time with untimed last, then title", () => {
    expect(
      order([
        t("c", { priority: "low" }),
        t("b", { dueAtMs: 2000 }),
        t("a", { dueAtMs: 1000 }),
        t("z-untimed"),
        t("h", { priority: "high" }),
      ]),
    ).toEqual(["h", "a", "b", "z-untimed", "c"]);
  });
  it("breaks ties alphabetically", () => {
    expect(order([t("beta"), t("alpha")])).toEqual(["alpha", "beta"]);
  });
});
