import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/domain/constants";

export type AuditView = {
  action: string;
  actorName: string;
  from: string | null;
  to: string | null;
  meta: Record<string, unknown>;
};

const status = (s: string | null) => (s && s in TASK_STATUS_LABEL ? TASK_STATUS_LABEL[s as TaskStatus] : (s ?? ""));

/** Plain names for the fields an edit can touch; fields that are only bookkeeping are left out. */
const FIELD_LABEL: Record<string, string> = {
  title: "the title",
  description: "the details",
  priority: "the priority",
  date: "the day",
  dueAt: "the due time",
  requiresReview: "the review rule",
  assigneeIds: "who it is for",
  completionMode: "how it completes",
  subtasks: "the checklist",
  dependsOnIds: "what it waits on",
  relatedTaskIds: "related tasks",
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * One readable line. With `named`, the task's title is spelled out ("Ali moved “MVP task” from To-Do to Blocked"), which is what
 * the audit log needs; inside a task's own timeline the title is left out and the line says "it".
 */
export function describeAudit(e: AuditView, opts: { named?: boolean } = {}): string {
  const who = e.actorName;
  // Older step entries stored the step's name under "title"; newer ones keep the task's name there and the step's as "subtaskTitle".
  const legacyStep = e.action === "task.subtask" && !e.meta.subtaskTitle;
  const title = text(e.meta.taskTitle) || (legacyStep ? "" : text(e.meta.title));
  const it = opts.named ? (title ? `“${title}”` : "a task") : "it";
  const the = opts.named ? (title ? `“${title}”` : "a task") : "the task";
  const note = text(e.meta.note) ? ` · “${text(e.meta.note)}”` : "";

  switch (e.action) {
    case "task.create": {
      const names = Array.isArray(e.meta.assigneeNames) ? list((e.meta.assigneeNames as unknown[]).map(String)) : "";
      return opts.named ? `${who} assigned ${the}${names ? ` to ${names}` : ""}` : `${who} created the task`;
    }
    case "task.update": {
      const changed = (Array.isArray(e.meta.changed) ? (e.meta.changed as string[]) : []).map((k) => FIELD_LABEL[k]).filter(Boolean);
      return changed.length ? `${who} edited ${opts.named ? `${the}: ` : ""}${list(changed)}` : `${who} edited ${the}`;
    }
    case "task.status": {
      const reason = text(e.meta.reason) ? `: ${text(e.meta.reason)}` : "";
      return `${who} moved ${it} from ${status(e.from)} to ${status(e.to)}${reason}${note}`;
    }
    case "task.complete":
      return `${who} finished their part${opts.named ? ` of ${it}` : ""} (${String(e.meta.progress ?? "")})${note}`;
    case "task.reopen":
      return `${who} took back their part${opts.named ? ` of ${it}` : ""} (${String(e.meta.progress ?? "")})`;
    case "task.subtask":
      return `${who} ${e.to === "true" ? "ticked" : "unticked"} “${text(e.meta.subtaskTitle) || text(e.meta.title) || "a step"}”${opts.named && title ? ` on ${it}` : ""} (${String(e.meta.progress ?? "")})${note}`;
    case "task.comment":
      return `${who} commented${opts.named ? ` on ${it}` : ""}: “${text(e.meta.note)}”`;
    case "task.missed":
      return `${who} gave a reason for not doing ${it}: “${text(e.meta.reason)}”`;
    case "task.refresh":
      return opts.named ? `${it} was refreshed from its daily routine` : "Refreshed from its daily routine";
    case "task.delete":
      return `${who} deleted ${the}`;
    case "task.generate": {
      const n = Number(e.meta.created ?? 0);
      return `Traxio created ${n} daily routine ${n === 1 ? "task" : "tasks"} for ${String(e.meta.date ?? "the day")}`;
    }
    case "template.create":
      return `${who} added the daily routine ${title ? `“${title}”` : ""}`.trim();
    case "template.update": {
      const verb = e.from === "active" && e.to === "paused" ? "paused" : e.from === "paused" && e.to === "active" ? "resumed" : "updated";
      return `${who} ${verb} the daily routine${title ? ` “${title}”` : ""}`;
    }
    case "template.delete":
      return `${who} deleted the daily routine${title ? ` “${title}”` : ""}`;
    default:
      return `${who} made a change`;
  }
}
