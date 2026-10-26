"use client";

import { useMemo, useState } from "react";
import { CalendarOff, Coffee, Plus } from "lucide-react";
import { query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/features/confirm-dialog";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { LeaveRequestSheet } from "@/components/features/leave/leave-request-sheet";
import { LeaveStatusBadge, describeRequest } from "@/components/features/leave/leave-status";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { daysBetween } from "@/lib/domain/timeoff";
import { BREAK_LABEL, formatDuration } from "@/lib/domain/presence";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import type { BreakDoc, LeaveRequestDoc } from "@/types/models";

export const fmtDay = (date: string) => formatPkt(pktInstant(date, "12:00"), "EEE d MMM");

export function MyLeaveView({ uid }: { uid: string }) {
  const { db } = getFirebase();
  const today = pktDateString();
  const requestsQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("employeeId", "==", uid)), [db, uid]);
  const breaksQ = useMemo(() => query(orgCollection(db, "breaks"), where("employeeId", "==", uid), where("date", "==", today)), [db, uid, today]);
  const requests = useCollection<LeaveRequestDoc>(requestsQ);
  const breaks = useCollection<BreakDoc>(breaksQ);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const sorted = useMemo(() => [...(requests.data ?? [])].sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now())), [requests.data]);
  const todaysBreaks = useMemo(() => [...(breaks.data ?? [])].sort((a, b) => (a.startAt?.toMillis() ?? Date.now()) - (b.startAt?.toMillis() ?? Date.now())), [breaks.data]);

  async function cancel(requestId: string) {
    try {
      await apiFetch("/api/leave", "POST", { action: "cancel", requestId });
      toast.success("Request cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't cancel that request.");
      throw error;
    }
  }

  return (
    <>
      <PageHeader
        title="Leave & breaks"
        subtitle="Ask for time off and see today's breaks. Approved leave pauses your daily tasks."
        actions={
          <Button onClick={() => setSheetOpen(true)}>
            <Plus aria-hidden /> Request time off
          </Button>
        }
      />

      <section aria-labelledby="my-requests" className="mb-8">
        <h2 id="my-requests" className="mb-3 font-display text-lg font-semibold">
          Your requests
        </h2>
        {requests.error ? (
          <ErrorState onRetry={requests.retry} />
        ) : requests.loading ? (
          <div aria-busy aria-label="Loading your requests" className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-card" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={CalendarOff} title="No requests yet" description="Need a day off or a few hours? Send a request and your admin will approve or decline it." />
        ) : (
          <ul className="space-y-3">
            {sorted.map((r) => (
              <li key={r.id}>
                <GlassCard className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="num text-sm font-semibold">{describeRequest(r, fmtDay, daysBetween(r.fromDate, r.toDate))}</p>
                    <LeaveStatusBadge status={r.status} />
                  </div>
                  <p className="mt-2 whitespace-pre-line">{r.reason}</p>
                  {r.decidedByName && r.status !== "pending" && r.status !== "cancelled" ? (
                    <p className="mt-2 text-sm text-muted">
                      {r.decidedByName} {r.status === "approved" ? "approved this" : "didn't approve this"}
                      {r.decisionNote ? `: “${r.decisionNote}”` : "."}
                    </p>
                  ) : null}
                  {r.status === "pending" ? (
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)}>
                        Cancel request
                      </Button>
                    </div>
                  ) : null}
                </GlassCard>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-breaks">
        <h2 id="my-breaks" className="mb-3 font-display text-lg font-semibold">
          Today&apos;s breaks
        </h2>
        {breaks.error ? (
          <ErrorState onRetry={breaks.retry} />
        ) : breaks.loading ? (
          <Skeleton aria-busy aria-label="Loading breaks" className="h-20 rounded-card" />
        ) : todaysBreaks.length === 0 ? (
          <EmptyState icon={Coffee} title="No breaks yet today" description="Use the status button at the top to start a Namaz, lunch or other break." />
        ) : (
          <GlassCard className="divide-y p-0">
            {todaysBreaks.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <p className="text-sm font-medium">
                  {BREAK_LABEL[b.type]}
                  {b.note ? <span className="font-normal text-muted"> · {b.note}</span> : null}
                </p>
                <p className="num text-sm text-muted">
                  {formatPkt(b.startAt.toDate(), "h:mm a")} to {b.endAt ? formatPkt(b.endAt.toDate(), "h:mm a") : "now"}
                  {b.endAt ? ` (${formatDuration((b.endAt.toMillis() - b.startAt.toMillis()) / 1000)})` : ""}
                </p>
              </div>
            ))}
          </GlassCard>
        )}
      </section>

      <LeaveRequestSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="Cancel this request?"
        description="Your admin won't see it any more. You can send a new one any time."
        confirmLabel="Cancel request"
        onConfirm={() => (cancelId ? cancel(cancelId) : undefined)}
      />
    </>
  );
}
