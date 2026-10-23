"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { BellRing, ChevronLeft, ChevronRight, Lock, NotebookPen } from "lucide-react";
import { query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { JournalTimeline } from "@/components/features/journal/journal-timeline";
import { TaskChipCard, TaskPanel } from "@/components/features/journal/task-panel";
import { useCollection } from "@/hooks/use-collection";
import { useJournalEditor } from "@/hooks/use-journal-editor";
import { useMyHours } from "@/hooks/use-my-hours";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { addTaskToSlot, fillStats, isWorkingDay } from "@/lib/domain/journal";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktDateString } from "@/lib/time";
import type { TaskDoc, WithId } from "@/types/models";

const shift = (date: string, days: number) => dateStringFromDayIndex(dayIndexFromDateString(date) + days);

export function JournalView({ uid }: { uid: string }) {
  const now = useNow();
  const today = pktDateString(now);
  // null = "follow today", so the page rolls over to the new day by itself at midnight.
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const editable = date === today;

  const hours = useMyHours(uid);
  const journal = useJournalEditor(uid, date, editable);
  const { db } = getFirebase();
  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("assigneeIds", "array-contains", uid), where("date", "==", date)), [db, uid, date]);
  const tasks = useCollection<TaskDoc>(tasksQ);

  const [dragging, setDragging] = useState<WithId<TaskDoc> | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const stats = useMemo(() => fillStats(journal.slots, hours.expected), [journal.slots, hours.expected]);
  const usedIds = useMemo(() => new Set(Object.values(journal.slots).flatMap((s) => s?.taskIds ?? [])), [journal.slots]);

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const over = e.over ? String(e.over.id) : "";
    if (!over.startsWith("slot-")) return;
    const key = over.slice(5);
    journal.update(key, addTaskToSlot(journal.slots[key], String(e.active.id)), { immediate: true });
  }

  const error = hours.error ?? journal.error ?? tasks.error;
  const loading = hours.loading || journal.loading || tasks.loading;

  const nav = (
    <div className="flex items-center gap-1">
      <Tooltip label="Previous day">
        <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => setPicked(shift(date, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
      </Tooltip>
      <Button variant="secondary" disabled={editable} onClick={() => setPicked(null)}>
        Today
      </Button>
      <Tooltip label={editable ? "That's today" : "Next day"}>
        <Button variant="secondary" size="icon" aria-label="Next day" disabled={editable} onClick={() => setPicked(shift(date, 1) >= today ? null : shift(date, 1))}>
          <ChevronRight aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );

  return (
    <>
      <PageHeader title="Journal" subtitle={`${formatPkt(new Date(`${date}T12:00:00+05:00`), "EEEE, d MMMM")} · note what you worked on, hour by hour.`} actions={nav} />

      {error ? (
        <ErrorState
          onRetry={() => {
            hours.retry();
            journal.retry();
            tasks.retry();
          }}
        />
      ) : loading ? (
        <div aria-busy aria-label="Loading your journal" className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-64 rounded-card" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!editable ? (
            <div role="status" className="flex items-start gap-3 rounded-card border border-border-solid bg-surface-raised px-4 py-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              <p className="text-sm">
                <span className="font-semibold">This day is locked.</span> Journals close at midnight (Pakistan time) so they stay an honest record. You can read it, but not change it.
              </p>
            </div>
          ) : null}

          <GlassCard className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <div className="min-w-48 flex-1">
              <p className="font-display text-lg font-bold">
                <span className="num">
                  {stats.filled} of {stats.expected}
                </span>{" "}
                hours logged
              </p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={stats.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Hours logged">
                <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-300" style={{ width: `${stats.pct}%` }} />
              </div>
              {!isWorkingDay(hours.workDays, date) ? <p className="mt-2 text-sm text-muted">Not a regular working day for your business.</p> : null}
            </div>
            <div className="flex flex-col items-end gap-2 text-sm" aria-live="polite">
              {editable ? (
                <span className={journal.save.status === "error" ? "text-danger" : "text-muted"}>
                  {journal.save.status === "saving" ? "Saving…" : journal.save.status === "saved" ? "All changes saved" : journal.save.status === "error" ? "Not saved" : "Saves automatically"}
                </span>
              ) : null}
              {editable && permission === "default" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => setPermission(await Notification.requestPermission())}
                >
                  <BellRing aria-hidden /> Remind me at :55 even when this tab is hidden
                </Button>
              ) : null}
              {editable && permission === "denied" ? <span className="text-muted">Browser reminders are blocked. You&apos;ll still see the prompt inside Traxio.</span> : null}
            </div>
          </GlassCard>
          {journal.save.status === "error" ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {journal.save.message}
            </p>
          ) : null}

          {hours.expected.length === 0 ? (
            <GlassCard className="flex flex-col items-center px-6 py-10 text-center">
              <NotebookPen className="mb-3 size-8 text-muted" aria-hidden />
              <p className="font-semibold">No working hours are set for you yet.</p>
              <p className="mt-1 text-sm text-muted">Ask your admin to set your business hours, then your hourly timeline appears here.</p>
            </GlassCard>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current?.task as WithId<TaskDoc>) ?? null)}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragging(null)}
            >
              <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
                <div className="lg:sticky lg:top-20">
                  <TaskPanel tasks={tasks.data ?? []} usedIds={usedIds} editable={editable} />
                </div>
                <JournalTimeline date={date} today={today} now={now} expected={hours.expected} slots={journal.slots} editable={editable} tasks={tasks.data ?? []} onChange={journal.update} onFlush={journal.flush} />
              </div>
              <DragOverlay dropAnimation={null}>{dragging ? <div className="w-72"><TaskChipCard task={dragging} dragging /></div> : null}</DragOverlay>
            </DndContext>
          )}
        </div>
      )}
    </>
  );
}
