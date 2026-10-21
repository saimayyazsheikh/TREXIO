import { Ban, CircleCheck, CircleX, Hourglass, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaveRequestDoc } from "@/types/models";

const STYLE: Record<LeaveRequestDoc["status"], { label: string; cls: string; icon: LucideIcon }> = {
  pending: { label: "Waiting for a decision", cls: "bg-warning/15 text-warning", icon: Hourglass },
  approved: { label: "Approved", cls: "bg-success/15 text-success", icon: CircleCheck },
  rejected: { label: "Not approved", cls: "bg-danger/15 text-danger", icon: CircleX },
  cancelled: { label: "Cancelled", cls: "bg-surface-raised text-muted", icon: Ban },
};

export function LeaveStatusBadge({ status }: { status: LeaveRequestDoc["status"] }) {
  const { label, cls, icon: Icon } = STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** "Thu 22 Oct to Fri 23 Oct (2 days)" or "Thu 22 Oct, 14:00 to 16:00". */
export function describeRequest(r: Pick<LeaveRequestDoc, "kind" | "fromDate" | "toDate" | "fromTime" | "toTime">, fmt: (date: string) => string, days: number): string {
  if (r.kind === "excuse") return `${fmt(r.fromDate)}, ${r.fromTime} to ${r.toTime}`;
  return r.fromDate === r.toDate ? `${fmt(r.fromDate)} (1 day)` : `${fmt(r.fromDate)} to ${fmt(r.toDate)} (${days} days)`;
}
