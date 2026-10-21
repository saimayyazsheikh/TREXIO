import { Circle, CircleCheck, CircleDashed, CircleDot, Flame, Minus, OctagonAlert, ArrowDown, Eye } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<TaskStatus, { icon: LucideIcon; cls: string }> = {
  todo: { icon: CircleDashed, cls: "bg-status-todo/15 text-status-todo" },
  in_progress: { icon: CircleDot, cls: "bg-status-progress/15 text-status-progress" },
  under_review: { icon: Eye, cls: "bg-status-review/15 text-status-review" },
  completed: { icon: CircleCheck, cls: "bg-status-done/15 text-status-done" },
  blocked: { icon: OctagonAlert, cls: "bg-status-blocked/15 text-status-blocked" },
};

const PRIORITY_STYLE: Record<Priority, { icon: LucideIcon; cls: string }> = {
  high: { icon: Flame, cls: "bg-priority-high/15 text-priority-high" },
  medium: { icon: Minus, cls: "bg-priority-medium/15 text-priority-medium" },
  low: { icon: ArrowDown, cls: "bg-priority-low/15 text-priority-low" },
};

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** Colour is never the only signal: every badge carries an icon and a label. */
export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { icon: Icon, cls } = STATUS_STYLE[status];
  return (
    <span className={cn(pill, cls, className)}>
      <Icon className="size-3.5" aria-hidden />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const { icon: Icon, cls } = PRIORITY_STYLE[priority];
  return (
    <span className={cn(pill, cls, className)}>
      <Icon className="size-3.5" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Business tag using the business's own colour. */
export function BusinessChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn(pill, "border", className)}
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}1f` }}
    >
      <Circle className="size-2.5 fill-current" aria-hidden />
      {name}
    </span>
  );
}
