import { AlarmClock, Clock } from "lucide-react";
import { dueState } from "@/lib/domain/tasks";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskDoc } from "@/types/models";

/** Shows state, not just data: overdue (red), due soon (amber), later (muted). Always icon + words. */
export function DueChip({ task, status, now, today }: { task: Pick<TaskDoc, "dueAt" | "date">; status: TaskDoc["status"]; now: Date; today: string }) {
  const dueAt = task.dueAt?.toDate() ?? null;
  const state = dueState({ status, dueAt, date: task.date }, now, today);
  if (state === "none" || state === "done") return null;

  const time = dueAt ? formatPkt(dueAt, "h:mm a") : null;
  const label =
    state === "overdue" ? (dueAt ? `Overdue · ${time}${task.date < today ? `, ${formatPkt(dueAt, "d MMM")}` : ""}` : `Overdue · from ${formatPkt(new Date(`${task.date}T12:00:00+05:00`), "d MMM")}`) : `Due ${time}`;
  const Icon = state === "overdue" ? AlarmClock : Clock;

  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        state === "overdue" && "bg-danger/15 text-danger",
        state === "soon" && "bg-warning/15 text-warning",
        state === "later" && "bg-surface-raised text-muted",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
