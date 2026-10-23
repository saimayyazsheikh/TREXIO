import { describeAudit } from "@/lib/domain/audit-text";

/** Plain-words groups for the "type" filter; each stored action belongs to exactly one. */
export const ACTION_GROUPS = [
  { id: "created", label: "Created", actions: ["task.create", "task.generate", "template.create"] },
  { id: "status", label: "Status changes", actions: ["task.status", "task.complete", "task.reopen"] },
  { id: "edits", label: "Edits", actions: ["task.update", "task.refresh", "task.subtask", "template.update"] },
  { id: "deleted", label: "Deleted", actions: ["task.delete", "template.delete"] },
] as const;

export type ActionGroupId = (typeof ACTION_GROUPS)[number]["id"];

export function groupOf(action: string): ActionGroupId | null {
  return ACTION_GROUPS.find((g) => (g.actions as readonly string[]).includes(action))?.id ?? null;
}

/** An audit row with the timestamp already turned into epoch milliseconds. */
export type AuditRow = {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  businessId: string;
  from: string | null;
  to: string | null;
  meta: Record<string, unknown>;
  createdAtMs: number;
};

export type AuditFilters = {
  businessId: string;
  actorId: string;
  group: ActionGroupId | "";
  search: string;
};

export const NO_FILTERS: AuditFilters = { businessId: "", actorId: "", group: "", search: "" };

/** The sentence shown for a row; also what the search box looks through. */
export const auditSentence = (r: AuditRow) => describeAudit(r);

export function filterAudit(rows: AuditRow[], f: AuditFilters): AuditRow[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.businessId && r.businessId !== f.businessId) return false;
    if (f.actorId && r.actorId !== f.actorId) return false;
    if (f.group && groupOf(r.action) !== f.group) return false;
    if (!needle) return true;
    const haystack = [auditSentence(r), r.actorName, r.action, r.entityId, JSON.stringify(r.meta)].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * One CSV cell. Quotes are doubled, and a cell that a spreadsheet could read as a formula (starts with = + - @ or a tab/CR)
 * gets a leading apostrophe, so a task title like `=HYPERLINK(...)` can never run when the admin opens the export.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = ["When (PKT)", "Who", "Role", "What happened", "Action", "Entity", "Entity id", "From", "To", "Details"] as const;

export function auditCsv(rows: AuditRow[], formatWhen: (ms: number) => string, businessName: (id: string) => string): string {
  const lines = [[...HEADERS, "Business"].map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [formatWhen(r.createdAtMs), r.actorName, r.actorRole, auditSentence(r), r.action, r.entityType, r.entityId, r.from, r.to, JSON.stringify(r.meta), businessName(r.businessId)]
        .map(csvCell)
        .join(","),
    );
  }
  // CRLF and a BOM so Excel opens it as UTF-8 with the right rows.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "just now", "5m ago", "3h ago", "2d ago". Older than a week is left to the caller to show as a date. */
export function timeAgo(ms: number, nowMs: number): string {
  const sec = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** First instant of the PKT day `daysAgo` days before `todayStartMs`. */
export const dayStartMs = (todayStartMs: number, daysAgo: number) => todayStartMs - daysAgo * 24 * 60 * 60 * 1000;
