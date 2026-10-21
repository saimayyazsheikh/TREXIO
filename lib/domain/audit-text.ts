import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/domain/constants";

export type AuditView = {
  action: string;
  actorName: string;
  from: string | null;
  to: string | null;
  meta: Record<string, unknown>;
};

const status = (s: string | null) => (s && s in TASK_STATUS_LABEL ? TASK_STATUS_LABEL[s as TaskStatus] : (s ?? ""));

/** One readable line for the task timeline, e.g. "Ali moved it from To-Do to Blocked: printer is down". */
export function describeAudit(e: AuditView): string {
  const who = e.actorName;
  switch (e.action) {
    case "task.create":
      return `${who} created the task`;
    case "task.update": {
      const changed = Array.isArray(e.meta.changed) ? (e.meta.changed as string[]).filter((k) => !["waitingOnIds", "linkTitles", "subtaskTotal", "subtaskDone", "assigneeNames", "completion", "businessId"].includes(k)) : [];
      return changed.length ? `${who} edited ${changed.join(", ")}` : `${who} edited the task`;
    }
    case "task.status": {
      const reason = typeof e.meta.reason === "string" ? `: ${e.meta.reason}` : "";
      return `${who} moved it from ${status(e.from)} to ${status(e.to)}${reason}`;
    }
    case "task.complete":
      return `${who} finished their part (${String(e.meta.progress ?? "")})`;
    case "task.reopen":
      return `${who} took back their part (${String(e.meta.progress ?? "")})`;
    case "task.subtask":
      return `${who} ${e.to === "true" ? "ticked" : "unticked"} “${String(e.meta.title ?? "a step")}” (${String(e.meta.progress ?? "")})`;
    case "task.refresh":
      return "Refreshed from its daily routine";
    case "task.delete":
      return `${who} deleted the task`;
    default:
      return `${who} made a change`;
  }
}
