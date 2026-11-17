import { describe, expect, it } from "vitest";
import { buildClientRows, knownClients } from "@/lib/domain/clients";

const now = 1_000_000;
const t = (over: Record<string, unknown> = {}) => ({ client: "Acme", status: "todo", dueAtMs: null, completedAtMs: null, ...over });

describe("buildClientRows", () => {
  it("groups by client without regard to case, and ignores tasks with no client", () => {
    const rows = buildClientRows([t(), t({ client: "ACME " }), t({ client: "Zed" }), t({ client: "" }), t({ client: null }), { status: "todo", dueAtMs: null, completedAtMs: null }], now);
    expect(rows.map((r) => [r.client, r.assigned])).toEqual([["Acme", 2], ["Zed", 1]]);
  });

  it("counts done, open and late", () => {
    const [row] = buildClientRows(
      [
        t({ status: "completed", dueAtMs: 500, completedAtMs: 400 }),
        t({ status: "completed", dueAtMs: 500, completedAtMs: 600 }),
        t({ status: "in_progress", dueAtMs: 900 }),
        t({ status: "todo", dueAtMs: now + 100 }),
        t({ status: "todo" }),
      ],
      now,
    );
    expect(row).toMatchObject({ assigned: 5, done: 2, open: 3, late: 2, donePct: 40 });
  });

  it("is empty when no task has a client", () => {
    expect(buildClientRows([t({ client: "" })], now)).toEqual([]);
  });
});

describe("knownClients", () => {
  it("lists the names in use, the most used first, spelled as first written", () => {
    expect(knownClients([{ client: "Acme" }, { client: "zed" }, { client: "acme" }, { client: " " }, {}])).toEqual(["Acme", "zed"]);
  });
});
