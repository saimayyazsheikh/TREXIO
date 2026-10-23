"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks, PartyPopper } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { DayNotice } from "@/components/features/leave/day-notice";
import { BlockDialog } from "@/components/features/tasks/block-dialog";
import { TaskCard } from "@/components/features/tasks/task-card";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { useTaskActions } from "@/hooks/use-task-actions";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { compareTasks } from "@/lib/domain/task-sort";
import { formatPkt, pktDateString } from "@/lib/time";
import type { TaskDoc, WithId } from "@/types/models";

const sortTasks = (tasks: WithId<TaskDoc>[]) =>
  [...tasks].sort((a, b) => compareTasks({ ...a, dueAtMs: a.dueAt?.toMillis() ?? null }, { ...b, dueAtMs: b.dueAt?.toMillis() ?? null }));

export function TodayView({ uid }: { uid: string }) {
  const now = useNow();
  const today = pktDateString(now);

  const todayQ = useMemo(() => query(orgCollection(getFirebase().db, "tasks"), where("assigneeIds", "array-contains", uid), where("date", "==", today)), [uid, today]);
  const carryQ = useMemo(
    () => query(orgCollection(getFirebase().db, "tasks"), where("assigneeIds", "array-contains", uid), where("kind", "==", "oneoff"), where("date", "<", today), orderBy("date", "desc"), limit(50)),
    [uid, today],
  );
  const todays = useCollection<TaskDoc>(todayQ);
  const carried = useCollection<TaskDoc>(carryQ);

  // Safety net: make sure today's daily routines exist even if the nightly job hasn't run (idempotent).
  useEffect(() => {
    apiFetch("/api/me/ensure-daily", "POST", {}).catch(() => undefined);
  }, [today]);

  const all = useMemo(() => [...(todays.data ?? []), ...(carried.data ?? [])], [todays.data, carried.data]);
  const { displayStatus, move, tickSubtask, savingSubtasks } = useTaskActions({ uid, role: "employee" }, all);
  const [blocking, setBlocking] = useState<WithId<TaskDoc> | null>(null);

  const error = todays.error ?? carried.error;
  const loading = todays.loading || carried.loading;
  const todayTasks = sortTasks(todays.data ?? []);
  const overdue = sortTasks((carried.data ?? []).filter((t) => displayStatus(t) !== "completed"));
  const daily = todayTasks.filter((t) => t.kind === "daily");
  const oneoff = todayTasks.filter((t) => t.kind === "oneoff");
  // "Done" for you means your own part is ticked, even if teammates are still finishing theirs.
  const isDone = (t: WithId<TaskDoc>) => displayStatus(t) === "completed" || !!t.completion[uid]?.done;
  const doneCount = todayTasks.filter(isDone).length;
  const pct = todayTasks.length ? Math.round((doneCount / todayTasks.length) * 100) : 0;
  const allDone = todayTasks.length > 0 && doneCount === todayTasks.length && overdue.length === 0;

  const renderList = (items: WithId<TaskDoc>[]) => (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t.id}>
          <TaskCard
            task={t}
            viewer={{ uid, role: "employee" }}
            status={displayStatus(t)}
            now={now}
            today={today}
            savingSubtasks={savingSubtasks}
            onMove={(task, status, opts) => void move(task, status, opts)}
            onBlock={setBlocking}
            onToggleSubtask={tickSubtask}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="Today" subtitle={`${formatPkt(now, "EEEE, d MMMM")} · tick things off as you finish them.`} />

      <DayNotice uid={uid} today={today} />
      {error ? (
        <ErrorState
          onRetry={() => {
            todays.retry();
            carried.retry();
          }}
        />
      ) : loading ? (
        <div aria-busy aria-label="Loading your tasks" className="space-y-3">
          <Skeleton className="h-20 rounded-card" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : todayTasks.length === 0 && overdue.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing assigned yet" description="When your admin gives you work for today, or your daily routine starts, it will show up here for you to check off." />
      ) : (
        <div className="space-y-8">
          {todayTasks.length > 0 ? (
            <GlassCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-bold">{allDone ? "All done for today. Nice work!" : `${doneCount} of ${todayTasks.length} done today`}</p>
                {allDone ? <PartyPopper className="size-6 text-success" aria-hidden /> : <span className="num text-sm font-semibold text-muted">{pct}%</span>}
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's progress">
                <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
            </GlassCard>
          ) : null}

          {overdue.length > 0 ? (
            <section aria-labelledby="overdue-heading">
              <h2 id="overdue-heading" className="mb-3 font-display text-lg font-bold text-danger">
                Carried over ({overdue.length})
              </h2>
              {renderList(overdue)}
            </section>
          ) : null}
          {daily.length > 0 ? (
            <section aria-labelledby="daily-heading">
              <h2 id="daily-heading" className="mb-3 font-display text-lg font-bold">
                Daily routine
              </h2>
              {renderList(daily)}
            </section>
          ) : null}
          {oneoff.length > 0 ? (
            <section aria-labelledby="oneoff-heading">
              <h2 id="oneoff-heading" className="mb-3 font-display text-lg font-bold">
                Assigned to you
              </h2>
              {renderList(oneoff)}
            </section>
          ) : null}
        </div>
      )}

      <BlockDialog
        title={blocking?.title ?? null}
        onOpenChange={(o) => !o && setBlocking(null)}
        onConfirm={(reason) => (blocking ? move(blocking, "blocked", { reason }) : Promise.resolve(false))}
      />
    </>
  );
}
