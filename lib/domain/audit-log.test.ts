import { describe, expect, it } from "vitest";
import { ACTION_GROUPS, NO_FILTERS, auditCsv, csvCell, filterAudit, groupOf, timeAgo, type AuditRow } from "@/lib/domain/audit-log";

const row = (o: Partial<AuditRow>): AuditRow => ({
  id: "1",
  action: "task.status",
  actorId: "ali",
  actorName: "Ali",
  actorRole: "employee",
  entityType: "task",
  entityId: "t1",
  businessId: "a",
  from: "todo",
  to: "blocked",
  meta: { reason: "printer is down" },
  createdAtMs: 0,
  ...o,
});

describe("groupOf", () => {
  it("puts every known action in exactly one group", () => {
    const all = ACTION_GROUPS.flatMap((g) => g.actions);
    expect(new Set(all).size).toBe(all.length);
    expect(groupOf("task.delete")).toBe("deleted");
    expect(groupOf("task.subtask")).toBe("edits");
  });
  it("returns null for an unknown action", () => {
    expect(groupOf("mystery")).toBeNull();
  });
});

describe("filterAudit", () => {
  const rows = [
    row({ id: "1" }),
    row({ id: "2", actorId: "sara", actorName: "Sara", businessId: "b", action: "task.create", from: null, to: null, meta: {} }),
    row({ id: "3", action: "task.delete", meta: {} }),
  ];
  it("keeps everything with no filters", () => expect(filterAudit(rows, NO_FILTERS)).toHaveLength(3));
  it("filters by business, person and type together", () => {
    expect(filterAudit(rows, { ...NO_FILTERS, businessId: "b" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAudit(rows, { ...NO_FILTERS, actorId: "ali", group: "deleted" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("searches the readable sentence, names and details, ignoring case", () => {
    expect(filterAudit(rows, { ...NO_FILTERS, search: "PRINTER" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAudit(rows, { ...NO_FILTERS, search: "sara" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAudit(rows, { ...NO_FILTERS, search: "  nothing here " })).toHaveLength(0);
  });
});

describe("timeAgo", () => {
  it("reads naturally", () => {
    const now = 10_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(timeAgo(now + 9_000, now)).toBe("just now");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell(null)).toBe("");
  });
  it("defuses spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+cmd", "-2", "@SUM(A1)", "\tx"]) expect(csvCell(bad).startsWith("'") || csvCell(bad).startsWith('"\'')).toBe(true);
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
  });
  it("writes a header, one line per row, a BOM and CRLF", () => {
    const out = auditCsv([row({ actorName: "=evil()" })], () => "21 Oct 2026, 9:00 AM", (id) => `Biz ${id}`);
    const lines = out.replace("﻿", "").trimEnd().split("\r\n");
    expect(out.startsWith("﻿")).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("When (PKT)");
    expect(lines[1]).toContain("'=evil()");
    expect(lines[1]).toContain("Biz a");
  });
});
