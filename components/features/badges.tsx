import { PRIORITY_LABEL, TASK_STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/domain/constants";
import { businessColorVar } from "@/lib/domain/business-colors";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<TaskStatus, { dot: string; cls: string }> = {
  todo: { dot: "bg-status-todo", cls: "bg-status-todo/12 text-status-todo" },
  in_progress: { dot: "bg-status-progress", cls: "bg-status-progress/12 text-status-progress" },
  under_review: { dot: "bg-status-review", cls: "bg-status-review/12 text-status-review" },
  completed: { dot: "bg-status-done", cls: "bg-status-done/12 text-status-done" },
  blocked: { dot: "bg-status-blocked", cls: "bg-status-blocked/12 text-status-blocked" },
};

const PRIORITY_STYLE: Record<Priority, { bars: number; cls: string }> = {
  high: { bars: 3, cls: "bg-priority-high/12 text-priority-high" },
  medium: { bars: 2, cls: "bg-priority-medium/12 text-priority-medium" },
  low: { bars: 1, cls: "bg-priority-low/12 text-priority-low" },
};

/** One shared pill shape, so status, priority, time and business line up when they sit side by side. */
export const pill = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold leading-none";

/** The word is always shown, so colour is never the only signal. */
export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { dot, cls } = STATUS_STYLE[status];
  return (
    <span className={cn(pill, cls, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

/** Three little bars fill up with the priority, next to the word. */
export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const { bars, cls } = PRIORITY_STYLE[priority];
  return (
    <span className={cn(pill, cls, className)}>
      <span aria-hidden className="flex items-end gap-px">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("w-[3px] rounded-[1px] bg-current", n <= bars ? "opacity-100" : "opacity-25")} style={{ height: 4 + n * 2 }} />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Business tag. `color` is a curated swatch id (see business-colors.ts); the name is always shown. */
export function BusinessChip({ name, color, className }: { name: string; color: string; className?: string }) {
  const c = businessColorVar(color);
  return (
    <span className={cn(pill, className)} style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)` }}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {name}
    </span>
  );
}
