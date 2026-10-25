"use client";

import { useMemo } from "react";
import { limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import type { AnalyticsInput } from "@/lib/domain/analytics";
import type { TeamInput } from "@/lib/domain/performance";
import { pktDateString, pktDayBounds } from "@/lib/time";
import type { BusinessDoc, CalendarDoc, JournalDoc, LeaveRequestDoc, PresenceDailyDoc, TaskDoc, UserDoc } from "@/types/models";

const CAP = 3000;
type AuditRow = { action: string; to: string | null; businessId: string; meta: Record<string, unknown> };

/**
 * Everything the analytics page needs for one period, as live queries scoped by date. While a new period loads, the
 * previous numbers stay on screen (`fetching`) instead of flashing a skeleton.
 */
export function useAnalyticsData(range: { from: string; to: string }, businessId: string) {
  const { db } = getFirebase();
  const { from, to } = range;
  const since = useMemo(() => Timestamp.fromDate(pktDayBounds(from).start), [from]);
  const until = useMemo(() => Timestamp.fromDate(pktDayBounds(to).end), [to]);

  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("date", ">=", from), where("date", "<=", to), orderBy("date", "asc"), limit(CAP)), [db, from, to]);
  const presenceQ = useMemo(() => query(orgCollection(db, "presenceDaily"), where("date", ">=", from), where("date", "<=", to), limit(CAP)), [db, from, to]);
  const journalsQ = useMemo(() => query(orgCollection(db, "journals"), where("date", ">=", from), where("date", "<=", to), limit(CAP)), [db, from, to]);
  const auditQ = useMemo(() => query(orgCollection(db, "auditLogs"), where("createdAt", ">=", since), where("createdAt", "<", until), orderBy("createdAt", "desc"), limit(CAP)), [db, since, until]);
  const calendarQ = useMemo(() => query(orgCollection(db, "calendar"), where("date", ">=", from), where("date", "<=", to)), [db, from, to]);
  // One inequality only (no composite index needed); approved ones that overlap the period are picked out below.
  const leaveQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("toDate", ">=", from)), [db, from]);
  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);

  const tasks = useCollection<TaskDoc>(tasksQ);
  const presence = useCollection<PresenceDailyDoc>(presenceQ);
  const journals = useCollection<JournalDoc>(journalsQ);
  const audit = useCollection<AuditRow>(auditQ);
  const calendar = useCollection<CalendarDoc>(calendarQ);
  const leave = useCollection<LeaveRequestDoc>(leaveQ);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const all = [tasks, presence, journals, audit, calendar, users, businesses, leave];
  const error = all.find((c) => c.error)?.error ?? null;
  const loading = all.some((c) => c.loading);

  const input = useMemo<AnalyticsInput | null>(() => {
    if (all.some((c) => c.data === null)) return null;
    return {
      from,
      to,
      businessId,
      nowMs: Date.now(),
      people: users.data!.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.name, businessId: u.businessId, workStart: u.workStart, workEnd: u.workEnd, joinedOn: u.createdAt ? pktDateString(u.createdAt.toDate()) : undefined })),
      businesses: businesses.data!.map((b) => ({ id: b.id, name: b.name, workDays: b.workDays, workStart: b.workStart, workEnd: b.workEnd })),
      tasks: tasks.data!.map((t) => ({
        date: t.date,
        businessId: t.businessId,
        assigneeIds: t.assigneeIds,
        doneBy: Object.entries(t.completion ?? {}).filter(([, c]) => c.done).map(([uid]) => uid),
        status: t.status,
        dueAtMs: t.dueAt?.toMillis() ?? null,
        completedAtMs: t.completedAt?.toMillis() ?? null,
      })),
      presence: presence.data!,
      journals: journals.data!.map((j) => ({ employeeId: j.employeeId, date: j.date, slots: Object.fromEntries(Object.entries(j.slots ?? {}).flatMap(([k, v]) => (v ? [[k, { text: v.text, taskIds: v.taskIds }]] : []))) })),
      blocked: audit.data!.flatMap((a) => (a.action === "task.status" && a.to === "blocked" && typeof a.meta?.reason === "string" ? [{ reason: a.meta.reason as string, businessId: a.businessId }] : [])),
      closed: calendar.data!.map((c) => ({ date: c.date, businessId: c.businessId })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, businessId, tasks.data, presence.data, journals.data, audit.data, calendar.data, users.data, businesses.data]);

  /** The pieces of a per-person report that don't depend on who is being looked at; the page adds the people and businesses. */
  const team = useMemo<Pick<TeamInput, "tasks" | "journals" | "presence" | "away" | "closed"> | null>(() => {
    if (all.some((c) => c.data === null)) return null;
    return {
      tasks: tasks.data!.map((t) => ({
        id: t.id,
        title: t.title,
        kind: t.kind,
        date: t.date,
        status: t.status,
        priority: t.priority,
        dueAtMs: t.dueAt?.toMillis() ?? null,
        completedAtMs: t.completedAt?.toMillis() ?? null,
        blockedReason: t.blockedReason,
        missedReason: t.missedReason ?? null,
        assigneeIds: t.assigneeIds,
        doneBy: Object.entries(t.completion ?? {}).filter(([, c]) => c.done).map(([uid]) => uid),
        businessId: t.businessId,
      })),
      journals: journals.data!.map((j) => ({ employeeId: j.employeeId, date: j.date, slots: Object.fromEntries(Object.entries(j.slots ?? {}).flatMap(([k, v]) => (v ? [[k, { text: v.text, taskIds: v.taskIds }]] : []))) })),
      presence: presence.data!.map((p) => ({ employeeId: p.employeeId, date: p.date, activeSec: p.activeSec, idleSec: p.idleSec, breakSec: p.breakSec, firstSeenMs: p.firstSeenAt.toMillis(), lastSeenMs: p.lastSeenAt.toMillis() })),
      away: leave.data!.filter((r) => r.status === "approved" && r.fromDate <= to),
      closed: calendar.data!.map((c) => ({ date: c.date, businessId: c.businessId })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, tasks.data, journals.data, presence.data, leave.data, calendar.data]);

  const truncated = [tasks, presence, journals, audit].some((c) => (c.data?.length ?? 0) >= CAP);
  const retry = () => all.forEach((c) => c.retry());
  return { input, team, people: users.data ?? [], businesses: businesses.data ?? [], loading, error, retry, truncated };
}
