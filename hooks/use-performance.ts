"use client";

import { useMemo } from "react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { useCollection } from "@/hooks/use-collection";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import type { PerformanceInput } from "@/lib/domain/performance";
import { pktDateString } from "@/lib/time";
import type { BusinessDoc, CalendarDoc, JournalDoc, LeaveRequestDoc, PresenceDailyDoc, TaskDoc, UserDoc } from "@/types/models";

/** Everything one person's performance report needs for a period, as live queries scoped to that person. */
export function usePerformanceInput(employeeId: string, range: { from: string; to: string }, today: string, nowMs: number) {
  const { db } = getFirebase();
  const { from, to } = range;

  const userRef = useMemo(() => orgDocument(db, "users", employeeId), [db, employeeId]);
  const user = useDocument<UserDoc>(userRef);
  const businessId = user.data?.businessId ?? null;
  const businessRef = useMemo(() => (businessId ? orgDocument(db, "businesses", businessId) : null), [db, businessId]);
  const business = useDocument<BusinessDoc>(businessRef);

  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("assigneeIds", "array-contains", employeeId), where("date", ">=", from), where("date", "<=", to), orderBy("date", "desc"), limit(600)), [db, employeeId, from, to]);
  const journalsQ = useMemo(() => query(orgCollection(db, "journals"), where("employeeId", "==", employeeId), where("date", ">=", from), where("date", "<=", to), orderBy("date", "desc"), limit(200)), [db, employeeId, from, to]);
  const presenceQ = useMemo(() => query(orgCollection(db, "presenceDaily"), where("employeeId", "==", employeeId), where("date", ">=", from), where("date", "<=", to), orderBy("date", "desc"), limit(200)), [db, employeeId, from, to]);
  const leaveQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("employeeId", "==", employeeId), orderBy("createdAt", "desc"), limit(200)), [db, employeeId]);
  const calendarQ = useMemo(() => query(orgCollection(db, "calendar"), where("date", ">=", from), where("date", "<=", to)), [db, from, to]);

  const tasks = useCollection<TaskDoc>(tasksQ);
  const journals = useCollection<JournalDoc>(journalsQ);
  const presence = useCollection<PresenceDailyDoc>(presenceQ);
  const leave = useCollection<LeaveRequestDoc>(leaveQ);
  const calendar = useCollection<CalendarDoc>(calendarQ);

  const all = [tasks, journals, presence, leave, calendar];
  const error = user.error ?? business.error ?? all.find((c) => c.error)?.error ?? null;
  const loading = user.loading || (!!businessId && business.loading) || all.some((c) => c.loading);

  const input = useMemo<PerformanceInput | null>(() => {
    if (!user.data || all.some((c) => c.data === null || c.data === undefined)) return null;
    if (businessId && !business.data) return null;
    const u = user.data;
    return {
      from,
      to,
      today,
      nowMs,
      person: { id: u.id, name: u.name, workStart: u.workStart, workEnd: u.workEnd, joinedOn: u.createdAt ? pktDateString(u.createdAt.toDate()) : undefined },
      business: business.data ? { id: business.data.id, name: business.data.name, workDays: business.data.workDays, workStart: business.data.workStart, workEnd: business.data.workEnd } : null,
      tasks: tasks.data!.map((t) => ({
        id: t.id,
        title: t.title,
        kind: t.kind,
        date: t.date,
        status: t.status,
        priority: t.priority,
        dueAtMs: t.dueAt?.toMillis() ?? null,
        completedAtMs: t.completedAt?.toMillis() ?? null,
        doneByMe: !!t.completion?.[employeeId]?.done,
        blockedReason: t.blockedReason,
        missedReason: t.missedReason ?? null,
      })),
      journals: journals.data!.map((j) => ({ date: j.date, slots: Object.fromEntries(Object.entries(j.slots ?? {}).flatMap(([k, v]) => (v ? [[k, { text: v.text, taskIds: v.taskIds }]] : []))) })),
      presence: presence.data!.map((p) => ({ date: p.date, activeSec: p.activeSec, idleSec: p.idleSec, breakSec: p.breakSec, firstSeenMs: (p.firstSeenAt ?? p.lastSeenAt)?.toMillis() ?? Date.now(), lastSeenMs: (p.lastSeenAt ?? p.firstSeenAt)?.toMillis() ?? Date.now() })),
      away: leave.data!.filter((r) => r.status === "approved" && r.toDate >= from && r.fromDate <= to),
      closed: calendar.data!.map((c) => ({ date: c.date, businessId: c.businessId })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.data, business.data, tasks.data, journals.data, presence.data, leave.data, calendar.data, from, to, today, employeeId, businessId, Math.floor(nowMs / 60_000)]);

  const retry = () => {
    user.retry();
    business.retry();
    all.forEach((c) => c.retry());
  };
  return { input, user: user.data, loading, error, retry };
}
