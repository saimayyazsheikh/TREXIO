import { csvCell } from "@/lib/domain/audit-log";

/** A spreadsheet-safe CSV: cells that could run as formulas are neutralised, CRLF line ends, and a BOM so Excel reads UTF-8. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
