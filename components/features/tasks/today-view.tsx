"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks, PartyPopper } from "lucide-react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { TaskCard } from "@/components/features/tasks/task-card";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import type { TaskStatus } from "@/lib/domain/constants";
import { compareTasks } from "@/lib/domain/task-sort";
import { resolveRequestedStatus } from "@/lib/domain/tasks";
import { formatPkt, pktDateString } from "@/lib/time";
import { toggleSubtask, transitionTask } from "@/lib/tasks-client";
import type { TaskDoc, WithId } from "@/types/models";

const sortTasks = (tasks: WithId<TaskDoc>[]) =>
  [...tasks].sort((a, b) => compareTasks({ ...a, dueAtMs: a.dueAt?.toMillis() ?? null }, { ...b, dueAtMs: b.dueAt?.toMillis() ?? null }));

export function TodayView({ uid }: { uid: string }) {
  const now = useNow();
  const today = pktDateString(now);

  const todayQ = useMemo(() => query(collection(getFirebase().db, "tasks"), where("assigneeIds", "array-contains", uid), where("date", "==", today)), [uid, today]);
  const carryQ = useMemo(
    () => query(collection(getFirebase().db, "tasks"), where("assigneeIds", "array-contains", uid), where("kind", "==", "oneoff"), where("date", "<", today), orderBy("date", "desc"), limit(50)),
    [uid, today],
  );
  const todays = useCollection<TaskDoc>(todayQ);
  const carried = useCollection<TaskDoc>(carryQ);

  // Safety net: make sure today's daily routines exist even if the nightly job hasn't run (idempotent).
  useEffect(() => {
    apiFetch("/api/me/ensure-daily", "POST", {}).catch(() => undefined);
  }, [today]);

  // Optimistic status, cleared once the live data catches up (or after a short grace period).
  const [pending, setPending] = useState<Record<string, TaskStatus>>({});
  const [savingSubtasks, setSavingSubtasks] = useState<ReadonlySet<string>>(new Set());
  const clearPending = useCallback((id: string) => setPending((p) => (id in p ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)) : p)), []);

  useEffect(() => {
    const all = [...(todays.data ?? []), ...(carried.data ?? [])];
    setPending((p) => {
      const next = Object.fromEntries(Object.entries(p).filter(([id, status]) => all.find((t) => t.id === id)?.status !== status));
      return Object.keys(next).length === Object.keys(p).length ? p : next;
    });
  }, [todays.data, carried.data]);

  const displayStatus = (t: WithId<TaskDoc>): TaskStatus => pending[t.id] ?? t.status;

  const requestStatus = useCallback(
    async (task: WithId<TaskDoc>, requested: TaskStatus) => {
      const resolved = resolveRequestedStatus(task, requested, "employee");
      setPending((p) => ({ ...p, [task.id]: resolved }));
      try {
        await transitionTask(task.id, requested);
        setTimeout(() => clearPending(task.id), 4000);
        if (resolved === "completed") {
          toast.success(`Done: ${task.title}`, { action: { label: "Undo", onClick: () => void requestStatus({ ...task, status: "completed" }, "todo") } });
        } else if (resolved === "under_review") {
          toast.success("Sent for review. Your admin will take a look.");
        }
      } catch (error) {
        clearPending(task.id);
        toast.error(error instanceof Error ? error.message : "Couldn't update that task.");
      }
    },
    [clearPending],
  );

  const tickSubtask = useCallback(async (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => {
    setSavingSubtasks((s) => new Set(s).add(subtaskId));
    try {
      await toggleSubtask(task.id, subtaskId, done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that step.");
    } finally {
      setSavingSubtasks((s) => new Set([...s].filter((x) => x !== subtaskId)));
    }
  }, []);

  const error = todays.error ?? carried.error;
  const loading = todays.loading || carried.loading;
  const todayTasks = sortTasks(todays.data ?? []);
  const overdue = sortTasks((carried.data ?? []).filter((t) => displayStatus(t) !== "completed"));
  const daily = todayTasks.filter((t) => t.kind === "daily");
  const oneoff = todayTasks.filter((t) => t.kind === "oneoff");
  const doneCount = todayTasks.filter((t) => displayStatus(t) === "completed").length;
  const pct = todayTasks.length ? Math.round((doneCount / todayTasks.length) * 100) : 0;
  const allDone = todayTasks.length > 0 && doneCount === todayTasks.length && overdue.length === 0;

  const renderList = (items: WithId<TaskDoc>[]) => (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t.id}>
          <TaskCard task={t} status={displayStatus(t)} now={now} today={today} savingSubtasks={savingSubtasks} onRequestStatus={requestStatus} onToggleSubtask={tickSubtask} />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="Today" subtitle={`${formatPkt(now, "EEEE, d MMMM")} · tick things off as you finish them.`} />

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
    </>
  );
}
