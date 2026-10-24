"use client";

import { useMemo, useState } from "react";
import { ChevronDown, NotebookPen } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessChip } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { DateNav } from "@/components/features/journal/date-nav";
import { JournalTimeline } from "@/components/features/journal/journal-timeline";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { effectiveHours, fillStats, isWorkingDay, workSlots, type Slots } from "@/lib/domain/journal";
import { formatPkt, pktDateString } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, JournalDoc, TaskDoc, UserDoc } from "@/types/models";

export function JournalsOverview() {
  const now = useNow();
  const today = pktDateString(now);
  const [date, setDate] = useState(today);
  const [businessId, setBusinessId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { db } = getFirebase();

  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const journalsQ = useMemo(() => query(orgCollection(db, "journals"), where("date", "==", date)), [db, date]);
  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("date", "==", date), limit(600)), [db, date]);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const journals = useCollection<JournalDoc>(journalsQ);
  const tasks = useCollection<TaskDoc>(tasksQ);

  const rows = useMemo(() => {
    const bById = new Map((businesses.data ?? []).map((b) => [b.id, b]));
    const jByEmployee = new Map((journals.data ?? []).map((j) => [j.employeeId, j]));
    return (users.data ?? [])
      .filter((u) => u.status === "active" && (!businessId || u.businessId === businessId))
      .map((u) => {
        const business = u.businessId ? bById.get(u.businessId) : undefined;
        const working = !!business && isWorkingDay(business.workDays, date);
        const hours = business && working ? effectiveHours(u, business) : null;
        const expected = hours ? workSlots(hours.start, hours.end) : [];
        const slots: Slots = Object.fromEntries(Object.entries(jByEmployee.get(u.id)?.slots ?? {}).flatMap(([k, v]) => (v ? [[k, { text: v.text, taskIds: v.taskIds }]] : [])));
        return { user: u, business, working, expected, slots, stats: fillStats(slots, expected) };
      })
      .sort((a, b) => Number(b.working) - Number(a.working) || a.stats.pct - b.stats.pct || a.user.name.localeCompare(b.user.name));
  }, [users.data, businesses.data, journals.data, businessId, date]);

  const working = rows.filter((r) => r.working);
  const average = working.length ? Math.round(working.reduce((s, r) => s + r.stats.pct, 0) / working.length) : 0;
  const error = users.error ?? businesses.error ?? journals.error ?? tasks.error;
  const loading = users.loading || businesses.loading || journals.loading || tasks.loading;

  return (
    <>
      <PageHeader title="Journals" subtitle="Who has logged their hours, and what they wrote. Days lock at midnight." actions={<DateNav date={date} today={today} onChange={setDate} />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-semibold">{formatPkt(new Date(`${date}T12:00:00+05:00`), "EEEE, d MMMM")}</p>
        <div className="w-full sm:w-56">
          <Select aria-label="Filter by business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">All businesses</option>
            {(businesses.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? (
        <ErrorState onRetry={() => { users.retry(); businesses.retry(); journals.retry(); tasks.retry(); }} />
      ) : loading ? (
        <div aria-busy aria-label="Loading journals" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No one to show yet" description="Journals appear here once you've added team members to a business." />
      ) : (
        <>
          <GlassCard className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
            <p className="font-display text-lg font-semibold">
              <span className="num">{average}%</span> average fill rate
            </p>
            <p className="text-sm text-muted">
              <span className="num">{working.filter((r) => r.stats.filled > 0).length}</span> of <span className="num">{working.length}</span> working today have logged something
            </p>
          </GlassCard>
          <ul className="space-y-3">
            {rows.map(({ user, business, working: isWorking, expected, slots, stats }) => {
              const open = openId === user.id;
              const mine = (tasks.data ?? []).filter((t) => t.assigneeIds.includes(user.id));
              return (
                <li key={user.id}>
                  <GlassCard className="p-4">
                    <button type="button" aria-expanded={open} aria-controls={`journal-${user.id}`} onClick={() => setOpenId(open ? null : user.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-left">
                      <Avatar name={user.name} />
                      <div className="min-w-0 flex-1 basis-44">
                        <p className="truncate font-semibold">{user.name}</p>
                        <div className="mt-1">{business ? <BusinessChip name={business.name} color={business.color} /> : null}</div>
                      </div>
                      {isWorking ? (
                        <div className="min-w-40 flex-1 basis-48">
                          <p className="num text-sm">
                            <span className="font-semibold">{stats.filled}</span> of {stats.expected} hours · {stats.pct}%
                          </p>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={stats.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${user.name}'s hours logged`}>
                            <div className={cn("h-full rounded-full", stats.pct >= 80 ? "bg-success" : stats.pct >= 40 ? "bg-warning" : "bg-danger")} style={{ width: `${stats.pct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">Not a working day</p>
                      )}
                      <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                    {open ? (
                      <div id={`journal-${user.id}`} className="mt-4 border-t pt-4">
                        {expected.length === 0 && Object.keys(slots).length === 0 ? (
                          <p className="text-sm text-muted">Nothing to show for this day.</p>
                        ) : (
                          <JournalTimeline date={date} today={today} now={now} expected={expected} slots={slots} editable={false} tasks={mine} onChange={() => undefined} onFlush={() => undefined} />
                        )}
                      </div>
                    ) : null}
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
