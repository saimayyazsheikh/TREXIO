"use client";

import { useMemo, useState } from "react";
import { NotebookPen } from "lucide-react";
import { collection, doc, query, where } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { DateNav } from "@/components/features/journal/date-nav";
import { JournalTimeline } from "@/components/features/journal/journal-timeline";
import { useCollection } from "@/hooks/use-collection";
import { useDocument } from "@/hooks/use-document";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { effectiveHours, fillStats, isWorkingDay, journalId, workSlots, type Slots } from "@/lib/domain/journal";
import { formatPkt, pktDateString } from "@/lib/time";
import type { BusinessDoc, JournalDoc, TaskDoc, UserDoc, WithId } from "@/types/models";

/** What an employee wrote on a given day, read-only, live. */
export function EmployeeJournalTab({ employee, business }: { employee: WithId<UserDoc>; business: WithId<BusinessDoc> | undefined }) {
  const now = useNow();
  const today = pktDateString(now);
  const [date, setDate] = useState(today);
  const { db } = getFirebase();

  const ref = useMemo(() => doc(db, "journals", journalId(employee.id, date)), [db, employee.id, date]);
  const journal = useDocument<JournalDoc>(ref);
  const tasksQ = useMemo(() => query(collection(db, "tasks"), where("assigneeIds", "array-contains", employee.id), where("date", "==", date)), [db, employee.id, date]);
  const tasks = useCollection<TaskDoc>(tasksQ);

  const expected = useMemo(() => {
    if (!business) return [];
    const { start, end } = effectiveHours(employee, business);
    return workSlots(start, end);
  }, [employee, business]);
  const slots: Slots = useMemo(() => Object.fromEntries(Object.entries(journal.data?.slots ?? {}).flatMap(([k, v]) => (v ? [[k, { text: v.text, taskIds: v.taskIds }]] : []))), [journal.data]);
  const stats = fillStats(slots, expected);
  const working = business ? isWorkingDay(business.workDays, date) : true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-bold">{formatPkt(new Date(`${date}T12:00:00+05:00`), "EEEE, d MMMM")}</p>
        <DateNav date={date} today={today} onChange={setDate} />
      </div>

      {journal.error || tasks.error ? (
        <ErrorState onRetry={() => { journal.retry(); tasks.retry(); }} />
      ) : journal.loading || tasks.loading ? (
        <div aria-busy aria-label="Loading journal" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : expected.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No working hours set" description="Set this person's business hours (or their own) and their hourly timeline appears here." />
      ) : (
        <>
          <GlassCard className="p-4">
            <p className="font-display text-lg font-bold">
              <span className="num">
                {stats.filled} of {stats.expected}
              </span>{" "}
              hours logged
              {!working ? <span className="ml-2 text-sm font-normal text-muted">(not a working day)</span> : null}
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={stats.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Hours logged">
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${stats.pct}%` }} />
            </div>
            {date < today ? <p className="mt-2 text-sm text-muted">Locked at midnight. This is the final record for the day.</p> : null}
          </GlassCard>
          <JournalTimeline date={date} today={today} now={now} expected={expected} slots={slots} editable={false} tasks={tasks.data ?? []} onChange={() => undefined} onFlush={() => undefined} />
        </>
      )}
    </div>
  );
}
