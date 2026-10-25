"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChartColumn, ListChecks, PartyPopper } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { DayNotice } from "@/components/features/leave/day-notice";
import { BlockDialog } from "@/components/features/tasks/block-dialog";
import { DayPlanCard } from "@/components/features/tasks/day-plan";
import { NoteDialog, type NoteTarget } from "@/components/features/tasks/note-dialog";
import { NotDonePanel } from "@/components/features/tasks/not-done-panel";
import { TaskCard } from "@/components/features/tasks/task-card";
import { useCollection } from "@/hooks/use-collection";
import { useMyHours } from "@/hooks/use-my-hours";
import { useNow } from "@/hooks/use-now";
import { useTaskActions } from "@/hooks/use-task-actions";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { effectiveHours } from "@/lib/domain/journal";
import { isMissed } from "@/lib/domain/tasks";
import { compareTasks } from "@/lib/domain/task-sort";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktDateString } from "@/lib/time";
import type { TaskDoc, WithId } from "@/types/models";

const sortTasks = (tasks: WithId<TaskDoc>[]) =>
  [...tasks].sort((a, b) => compareTasks({ ...a, dueAtMs: a.dueAt?.toMillis() ?? null }, { ...b, dueAtMs: b.dueAt?.toMillis() ?? null }));

/** How many days back a missed routine stays in the Not done box. */
const NOT_DONE_DAYS = 7;

export function TodayView({ uid }: { uid: string }) {
  const now = useNow();
  const today = pktDateString(now);
  const mine = useMyHours(uid);
  const hours = useMemo(() => (mine.user && mine.business ? effectiveHours(mine.user, mine.business) : { start: "09:00", end: "18:00" }), [mine.user, mine.business]);

  const col = () => orgCollection(getFirebase().db, "tasks");
  const todayQ = useMemo(() => query(col(), where("assigneeIds", "array-contains", uid), where("date", "==", today)), [uid, today]);
  const carryQ = useMemo(() => query(col(), where("assigneeIds", "array-contains", uid), where("kind", "==", "oneoff"), where("date", "<", today), orderBy("date", "desc"), limit(50)), [uid, today]);
  const earlierQ = useMemo(() => query(col(), where("assigneeIds", "array-contains", uid), where("kind", "==", "daily"), where("date", "<", today), orderBy("date", "desc"), limit(40)), [uid, today]);
  const todays = useCollection<TaskDoc>(todayQ);
  const carried = useCollection<TaskDoc>(carryQ);
  const earlier = useCollection<TaskDoc>(earlierQ);

  // Safety net: make sure today's daily routines exist even if the nightly job hasn't run (idempotent).
  useEffect(() => {
    apiFetch("/api/me/ensure-daily", "POST", {}).catch(() => undefined);
  }, [today]);

  const [noting, setNoting] = useState<NoteTarget | null>(null);
  const all = useMemo(() => [...(todays.data ?? []), ...(carried.data ?? []), ...(earlier.data ?? [])], [todays.data, carried.data, earlier.data]);
  const { displayStatus, move, tickSubtask, savingSubtasks } = useTaskActions({ uid, role: "employee" }, all, {
    onNote: (task, about, subtaskTitle) => setNoting({ task, about, subtaskTitle }),
  });
  const [blocking, setBlocking] = useState<WithId<TaskDoc> | null>(null);
  const [tab, setTab] = useState("tasks");

  const error = todays.error ?? carried.error ?? earlier.error;
  const loading = todays.loading || carried.loading || earlier.loading;
  const nowMs = now.getTime();

  const missed = (t: WithId<TaskDoc>) => isMissed({ kind: t.kind, status: displayStatus(t), dueAtMs: t.dueAt?.toMillis() ?? null, date: t.date }, nowMs, today);
  const oldest = dateStringFromDayIndex(dayIndexFromDateString(today) - NOT_DONE_DAYS);

  const todayTasks = sortTasks(todays.data ?? []);
  const routines = todayTasks.filter((t) => t.kind === "daily");
  const oneoffs = todayTasks.filter((t) => t.kind === "oneoff");
  const upcomingRoutines = routines.filter((t) => !missed(t));
  // Most recent first: what was missed today, then the days before.
  const notDone = [...routines.filter(missed), ...(earlier.data ?? []).filter((t) => t.date >= oldest && missed(t))].sort((a, b) => (b.dueAt?.toMillis() ?? 0) - (a.dueAt?.toMillis() ?? 0) || b.date.localeCompare(a.date));
  const needReason = notDone.filter((t) => !t.missedReason).length;
  const carriedOpen = sortTasks((carried.data ?? []).filter((t) => displayStatus(t) !== "completed"));

  // "Done" for you means your own part is ticked, even if teammates are still finishing theirs.
  const isDone = (t: WithId<TaskDoc>) => displayStatus(t) === "completed" || !!t.completion[uid]?.done;
  const doneCount = todayTasks.filter(isDone).length;
  const pct = todayTasks.length ? Math.round((doneCount / todayTasks.length) * 100) : 0;
  const allDone = todayTasks.length > 0 && doneCount === todayTasks.length && carriedOpen.length === 0 && notDone.length === 0;
  const openTasks = oneoffs.filter((t) => !isDone(t)).length + carriedOpen.length;
  const openRoutines = upcomingRoutines.filter((t) => !isDone(t)).length;

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
            onNote={(task) => setNoting({ task, about: "comment" })}
          />
        </li>
      ))}
    </ul>
  );

  const empty = (text: string) => <p className="rounded-card border border-dashed border-border-solid px-4 py-8 text-center text-sm text-muted">{text}</p>;

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={`${formatPkt(now, "EEEE, d MMMM")} · tick things off as you finish them.`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/me/performance">
              <ChartColumn aria-hidden /> My performance
            </Link>
          </Button>
        }
      />

      <DayNotice uid={uid} today={today} />
      {error ? (
        <ErrorState
          onRetry={() => {
            todays.retry();
            carried.retry();
            earlier.retry();
          }}
        />
      ) : loading ? (
        <div aria-busy aria-label="Loading your tasks" className="space-y-3">
          <Skeleton className="h-20 rounded-card" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : todayTasks.length === 0 && carriedOpen.length === 0 && notDone.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing assigned yet" description="When your admin gives you work for today, or your daily routine starts, it will show up here for you to check off." />
      ) : (
        <div className="space-y-6">
          {todayTasks.length > 0 ? (
            <GlassCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-semibold">{allDone ? "All done for today. Nice work!" : `${doneCount} of ${todayTasks.length} done today`}</p>
                {allDone ? <PartyPopper className="size-6 text-success" aria-hidden /> : <span className="num text-sm font-semibold text-muted">{pct}%</span>}
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's progress">
                <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
            </GlassCard>
          ) : null}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="tasks">
                  Tasks <span className="num ml-1 text-xs opacity-70">{openTasks}</span>
                </TabsTrigger>
                <TabsTrigger value="routines">
                  Daily routines <span className="num ml-1 text-xs opacity-70">{openRoutines}</span>
                </TabsTrigger>
                <TabsTrigger value="notdone" className="lg:hidden">
                  Not done{" "}
                  <span className={needReason > 0 ? "num ml-1 rounded-full bg-danger-solid px-1.5 text-[11px] font-bold text-white" : "num ml-1 text-xs opacity-70"}>{notDone.length}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tasks" className="space-y-6">
                {carriedOpen.length > 0 ? (
                  <section aria-labelledby="carried-heading">
                    <h2 id="carried-heading" className="mb-3 font-display text-lg font-semibold text-danger">
                      Carried over ({carriedOpen.length})
                    </h2>
                    {renderList(carriedOpen)}
                  </section>
                ) : null}
                <section aria-labelledby="oneoff-heading">
                  <h2 id="oneoff-heading" className="mb-3 font-display text-lg font-semibold">
                    Assigned to you
                  </h2>
                  {oneoffs.length > 0 ? renderList(oneoffs) : empty("No tasks for today. Check the Daily routines tab.")}
                </section>
              </TabsContent>

              <TabsContent value="routines">
                <DayPlanCard routines={routines} uid={uid} hours={hours} now={now} today={today} status={displayStatus} />
                <section aria-labelledby="daily-heading">
                  <h2 id="daily-heading" className="mb-3 font-display text-lg font-semibold">
                    Daily routine
                  </h2>
                  {upcomingRoutines.length > 0 ? renderList(upcomingRoutines) : empty(routines.length > 0 ? "No routines left that are still on time. See Not done." : "No daily routines today.")}
                </section>
              </TabsContent>

              <TabsContent value="notdone" className="lg:hidden">
                <NotDonePanel items={notDone} idp="tab" />
              </TabsContent>
            </Tabs>

            <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Not done">
              <NotDonePanel items={notDone} idp="side" />
            </aside>
          </div>
        </div>
      )}

      <BlockDialog
        title={blocking?.title ?? null}
        onOpenChange={(o) => !o && setBlocking(null)}
        onConfirm={(reason) => (blocking ? move(blocking, "blocked", { reason }) : Promise.resolve(false))}
      />
      <NoteDialog target={noting} onClose={() => setNoting(null)} />
    </>
  );
}
