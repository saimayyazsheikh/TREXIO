"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Check, X } from "lucide-react";
import { collection, limit, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { LeaveStatusBadge, describeRequest } from "@/components/features/leave/leave-status";
import { fmtDay } from "@/components/features/leave/my-leave-view";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { daysBetween } from "@/lib/domain/timeoff";
import { formatPkt } from "@/lib/time";
import type { LeaveRequestDoc, WithId } from "@/types/models";

type Decision = { request: WithId<LeaveRequestDoc>; decision: "approve" | "reject" };

function RequestCard({ r, onDecide }: { r: WithId<LeaveRequestDoc>; onDecide?: (d: Decision) => void }) {
  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {r.employeeName} <span className="font-normal text-muted">· {r.kind === "leave" ? "Days off" : "Short excuse"}</span>
        </p>
        <LeaveStatusBadge status={r.status} />
      </div>
      <p className="num mt-1 text-sm font-medium">{describeRequest(r, fmtDay, daysBetween(r.fromDate, r.toDate))}</p>
      <p className="mt-2 whitespace-pre-line">{r.reason}</p>
      <p className="num mt-2 text-xs text-muted">Sent {formatPkt(r.createdAt.toDate(), "EEE d MMM, h:mm a")}</p>
      {r.decidedByName && r.status !== "pending" && r.status !== "cancelled" ? (
        <p className="mt-1 text-sm text-muted">
          {r.status === "approved" ? "Approved" : "Declined"} by {r.decidedByName}
          {r.decisionNote ? `: “${r.decisionNote}”` : "."}
        </p>
      ) : null}
      {onDecide && r.status === "pending" ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onDecide({ request: r, decision: "reject" })}>
            <X aria-hidden /> Decline
          </Button>
          <Button size="sm" onClick={() => onDecide({ request: r, decision: "approve" })}>
            <Check aria-hidden /> Approve
          </Button>
        </div>
      ) : null}
    </GlassCard>
  );
}

export function LeaveApprovals() {
  const { db } = getFirebase();
  const q = useMemo(() => query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"), limit(200)), [db]);
  const requests = useCollection<LeaveRequestDoc>(q);
  const [pending, setPending] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const waiting = (requests.data ?? []).filter((r) => r.status === "pending");
  const history = (requests.data ?? []).filter((r) => r.status !== "pending");

  async function submit() {
    if (!pending) return;
    setBusy(true);
    try {
      await apiFetch("/api/leave", "POST", { action: "decide", requestId: pending.request.id, decision: pending.decision, note });
      toast.success(pending.decision === "approve" ? `Approved. ${pending.request.employeeName} has been told.` : `Declined. ${pending.request.employeeName} has been told.`);
      setPending(null);
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that decision.");
    } finally {
      setBusy(false);
    }
  }

  const skeleton = (
    <div aria-busy aria-label="Loading requests" className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-card" />
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Leave" subtitle="Approve or decline time off. Approved days off pause that person's daily tasks." />
      {requests.error ? (
        <ErrorState onRetry={requests.retry} />
      ) : (
        <Tabs defaultValue="waiting">
          <TabsList>
            <TabsTrigger value="waiting">Waiting{waiting.length ? ` (${waiting.length})` : ""}</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="waiting">
            {requests.loading ? (
              skeleton
            ) : waiting.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Nothing waiting" description="When someone asks for time off, it shows up here and a number appears on this tab." />
            ) : (
              <ul className="space-y-3">
                {waiting.map((r) => (
                  <li key={r.id}>
                    <RequestCard r={r} onDecide={setPending} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="history">
            {requests.loading ? (
              skeleton
            ) : history.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No past requests" description="Decided and cancelled requests are kept here." />
            ) : (
              <ul className="space-y-3">
                {history.map((r) => (
                  <li key={r.id}>
                    <RequestCard r={r} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) { setPending(null); setNote(""); } }}>
        <DialogContent>
          <DialogTitle>{pending?.decision === "approve" ? "Approve this request?" : "Decline this request?"}</DialogTitle>
          <DialogDescription>
            {pending ? `${pending.request.employeeName} will see your decision${pending.decision === "approve" && pending.request.kind === "leave" ? ", and their daily tasks pause on those days" : ""}.` : ""}
          </DialogDescription>
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="decision-note" className="text-sm font-medium">
              Note (optional)
            </label>
            <input
              id="decision-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="h-11 w-full rounded-control border border-input bg-surface-solid px-3 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant={pending?.decision === "reject" ? "danger" : "primary"} loading={busy} onClick={submit}>
              {pending?.decision === "approve" ? "Approve" : "Decline"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
