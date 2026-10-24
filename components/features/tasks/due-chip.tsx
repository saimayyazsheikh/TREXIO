import { AlarmClock, Clock } from "lucide-react";
import { dueState } from "@/lib/domain/tasks";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import { pill } from "@/components/features/badges";
import type { TaskDoc } from "@/types/models";

/** Shows state, not just data: overdue (red pill), due soon (amber), later (quiet text). Always icon + words. */
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
        "num",
        state === "overdue" && cn(pill, "bg-danger/12 text-danger"),
        state === "soon" && cn(pill, "bg-warning/12 text-warning"),
        state === "later" && "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-none text-muted",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
