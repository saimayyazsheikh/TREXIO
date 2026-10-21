import { describe, expect, it } from "vitest";
import { assertNoDependencyCycle, diffIds } from "@/lib/domain/dependencies";

/** Graph: key depends on the listed ids. */
const graph = (edges: Record<string, string[]>) => async (id: string) => edges[id] ?? [];

describe("assertNoDependencyCycle", () => {
  it("accepts a plain chain and a diamond", async () => {
    // A -> B -> C, and D -> B, D -> C
    const load = graph({ B: ["C"], C: [], D: [] });
    await expect(assertNoDependencyCycle("A", ["B"], load)).resolves.toBeUndefined();
    await expect(assertNoDependencyCycle("D", ["B", "C"], load)).resolves.toBeUndefined();
  });

  it("rejects a task depending on itself", async () => {
    await expect(assertNoDependencyCycle("A", ["A"], graph({}))).rejects.toThrow(/depend on itself/);
  });

  it("rejects a direct two-task loop", async () => {
    // B already depends on A; making A depend on B closes the loop.
    await expect(assertNoDependencyCycle("A", ["B"], graph({ B: ["A"] }))).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a long loop", async () => {
    // A <- B <- C <- D already (D depends on C depends on B depends on A); A depending on D closes it.
    const load = graph({ D: ["C"], C: ["B"], B: ["A"] });
    await expect(assertNoDependencyCycle("A", ["D"], load)).rejects.toThrow(/loop/);
  });

  it("terminates on an existing cycle elsewhere in the graph and on shared ancestors", async () => {
    const load = graph({ X: ["Y"], Y: ["X"], S: [], T: ["S"], U: ["S"] });
    await expect(assertNoDependencyCycle("A", ["X"], load)).resolves.toBeUndefined();
    await expect(assertNoDependencyCycle("A", ["T", "U"], load)).resolves.toBeUndefined();
  });

  it("gives up safely on enormous chains", async () => {
    const load = async (id: string) => [`n${Number(id.slice(1)) + 1}`];
    await expect(assertNoDependencyCycle("A", ["n0"], load)).rejects.toThrow(/too long/);
  });

  it("an empty dependency list is always fine", async () => {
    await expect(assertNoDependencyCycle("A", [], graph({}))).resolves.toBeUndefined();
  });
});

describe("diffIds", () => {
  it("reports additions and removals", () => {
    expect(diffIds(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    expect(diffIds([], [])).toEqual({ added: [], removed: [] });
  });
});
