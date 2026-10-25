import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/domain/csv";

describe("toCsv", () => {
  it("writes a header, rows, quoting and a BOM", () => {
    expect(toCsv(["Name", "Note"], [["Ali", 'said "hi", left'], ["Sara", null]])).toBe('﻿Name,Note\r\nAli,"said ""hi"", left"\r\nSara,\r\n');
  });
  it("defuses cells a spreadsheet would run as formulas", () => {
    expect(toCsv(["Task"], [["=HYPERLINK(\"x\")"]])).toContain("'=HYPERLINK");
  });
});
