"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClock, Gauge, Hand, Plus, ScaleIcon, UserCheck, Users } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessChip, pill } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { StatCard } from "@/components/features/stat-card";
import { TaskSheet } from "@/components/features/tasks/task-sheet";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { LOAD_LABEL, OPEN_STATUSES, buildWorkload, type LoadLevel, type WorkloadRow } from "@/lib/domain/workload";
import { pktDateString } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, LeaveRequestDoc, TaskDoc, UserDoc } from "@/types/models";

const LOAD_TONE: Record<LoadLevel, string> = {
  free: "bg-success/14 text-success",
  normal: "bg-info/14 text-info",
  heavy: "bg-danger/14 text-danger",
  away: "bg-surface-raised text-muted",
};

/** A bar split into what is late, what is stuck and the rest, scaled so a full bar means "heavy". */
function LoadBar({ row }: { row: WorkloadRow }) {
  const scale = Math.max(8, row.open);
  const late = (row.overdue / scale) * 100;
  const blocked = (Math.max(0, row.blocked) / scale) * 100;
  const rest = (Math.max(0, row.open - row.overdue - row.blocked) / scale) * 100;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`${row.open} open: ${row.overdue} overdue, ${row.blocked} blocked`}>
      <div className="flex h-full">
        <span className="h-full bg-danger" style={{ width: `${late}%` }} />
        <span className="h-full bg-warning" style={{ width: `${blocked}%` }} />
        <span className="h-full bg-brand" style={{ width: `${rest}%` }} />
      </div>
    </div>
  );
}

/** Who has how much on their plate right now. Pick someone with room, then hand them a task from here. */
export function WorkloadView() {
  const { db } = getFirebase();
  const now = useNow();
  const today = pktDateString(now);
  const [businessId, setBusinessId] = useState("");
  const [assignTo, setAssignTo] = useState<string | null>(null);

  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("status", "in", [...OPEN_STATUSES]), limit(1500)), [db]);
  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const leaveQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("toDate", ">=", today)), [db, today]);
  const tasks = useCollection<TaskDoc>(tasksQ);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const leave = useCollection<LeaveRequestDoc>(leaveQ);

  const error = tasks.error ?? users.error ?? businesses.error ?? leave.error;
  const loading = tasks.loading || users.loading || businesses.loading || leave.loading;
  const nowMinute = Math.floor(now.getTime() / 60_000);

  const rows = useMemo(() => {
    if (!tasks.data || !users.data || !leave.data) return null;
    const away = new Set(leave.data.filter((r) => r.status === "approved" && r.kind === "leave" && r.fromDate <= today && today <= r.toDate).map((r) => r.employeeId));
    const people = users.data.filter((u) => u.status === "active" && (!businessId || u.businessId === businessId)).map((u) => ({ id: u.id, name: u.name, businessId: u.businessId }));
    return buildWorkload({
      people,
      tasks: tasks.data.map((t) => ({
        kind: t.kind,
        date: t.date,
        status: t.status,
        priority: t.priority,
        dueAtMs: t.dueAt?.toMillis() ?? null,
        assigneeIds: t.assigneeIds,
        doneBy: Object.entries(t.completion ?? {}).filter(([, c]) => c.done).map(([uid]) => uid),
      })),
      today,
      nowMs: now.getTime(),
      away,
    });
    // The clock only matters to the minute for "overdue".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.data, users.data, leave.data, businessId, today, nowMinute]);

  const bizById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);
  const present = (rows ?? []).filter((r) => r.load !== "away");
  const totalOpen = present.reduce((n, r) => n + r.open, 0);
  const totalOverdue = present.reduce((n, r) => n + r.overdue, 0);
  const freeCount = present.filter((r) => r.load === "free").length;
  const heavyCount = present.filter((r) => r.load === "heavy").length;

  return (
    <>
      <PageHeader title="Workload" subtitle="Who has how much on their plate right now. Pick someone with room before you hand out the next task." />

      {(businesses.data?.length ?? 0) > 1 ? (
        <div role="group" aria-label="Business" className="mb-5 flex flex-wrap gap-2">
          {[{ id: "", name: "All businesses" }, ...(businesses.data ?? [])].map((b) => (
            <button
              key={b.id || "all"}
              type="button"
              aria-pressed={businessId === b.id}
              onClick={() => setBusinessId(b.id)}
              className={cn("min-h-11 rounded-control border px-4 text-sm font-medium transition-colors", businessId === b.id ? "border-transparent bg-brand text-brand-fg" : "border-input hover:bg-surface-raised")}
            >
              {b.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <ErrorState onRetry={() => { tasks.retry(); users.retry(); businesses.retry(); leave.retry(); }} />
      ) : loading || !rows ? (
        <div aria-busy aria-label="Loading workload" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-card" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No team members yet" description="Add your team first. Their workload shows up here as soon as they have tasks." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Open tasks" value={totalOpen} hint="Across the people shown" icon={Gauge} />
            <StatCard label="Overdue" value={totalOverdue} hint="Past their time" icon={AlarmClock} tone={totalOverdue > 0 ? "danger" : "success"} alert={totalOverdue > 0} />
            <StatCard label="Have room" value={freeCount} hint="2 open tasks or fewer" icon={UserCheck} tone="success" />
            <StatCard label="Heavily loaded" value={heavyCount} hint="8 open, or 3 overdue" icon={ScaleIcon} tone={heavyCount > 0 ? "warning" : "success"} />
          </div>

          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const biz = r.businessId ? bizById.get(r.businessId) : undefined;
              return (
                <li key={r.id}>
                  <GlassCard className="flex h-full flex-col gap-4 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={r.name} size="lg" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/employees/${r.id}`} className="block truncate font-semibold hover:underline">
                          {r.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {biz ? <BusinessChip name={biz.name} color={biz.color} /> : null}
                          <span className={cn(pill, LOAD_TONE[r.load])}>{LOAD_LABEL[r.load]}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="num font-display text-3xl font-semibold leading-none">{r.open}</p>
                        <p className="mt-1 text-xs text-muted">open</p>
                      </div>
                    </div>

                    <LoadBar row={r} />

                    <dl className="grid grid-cols-4 gap-2 text-center">
                      {[
                        ["Today", r.today, ""],
                        ["Overdue", r.overdue, r.overdue > 0 ? "text-danger" : ""],
                        ["Blocked", r.blocked, r.blocked > 0 ? "text-warning" : ""],
                        ["To review", r.inReview, ""],
                      ].map(([label, n, tone]) => (
                        <div key={label as string} className="rounded-control bg-surface-raised/60 px-1 py-2">
                          <dd className={cn("num text-lg font-semibold leading-none", tone as string)}>{n as number}</dd>
                          <dt className="mt-1 text-[11px] text-muted">{label as string}</dt>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-auto flex items-center justify-between gap-2">
                      <p className="text-xs text-muted">{r.upcoming > 0 ? `${r.upcoming} more for later days` : "Nothing planned for later days"}</p>
                      <Button size="sm" variant={r.load === "free" ? "primary" : "secondary"} disabled={r.load === "away"} onClick={() => setAssignTo(r.id)}>
                        {r.load === "away" ? <Hand aria-hidden /> : <Plus aria-hidden />} {r.load === "away" ? "On leave" : "Give a task"}
                      </Button>
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <TaskSheet open={assignTo !== null} onOpenChange={(o) => !o && setAssignTo(null)} employees={users.data ?? []} businesses={businesses.data ?? []} defaultAssigneeId={assignTo ?? undefined} />
    </>
  );
}
