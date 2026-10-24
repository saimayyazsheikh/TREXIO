import { Ban, CircleCheck, CircleX, Hourglass, type LucideIcon } from "lucide-react";
import { pill } from "@/components/features/badges";
import { cn } from "@/lib/utils";
import type { LeaveRequestDoc } from "@/types/models";

const STYLE: Record<LeaveRequestDoc["status"], { label: string; cls: string; icon: LucideIcon }> = {
  pending: { label: "Waiting for a decision", cls: "bg-warning/12 text-warning", icon: Hourglass },
  approved: { label: "Approved", cls: "bg-success/12 text-success", icon: CircleCheck },
  rejected: { label: "Not approved", cls: "bg-danger/12 text-danger", icon: CircleX },
  cancelled: { label: "Cancelled", cls: "bg-surface-raised text-muted", icon: Ban },
};

export function LeaveStatusBadge({ status }: { status: LeaveRequestDoc["status"] }) {
  const { label, cls, icon: Icon } = STYLE[status];
  return (
    <span className={cn(pill, cls)}>
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
