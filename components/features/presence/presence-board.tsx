"use client";

import { useMemo, useState } from "react";
import { Activity, Coffee, Hourglass, UserCheck, UserX } from "lucide-react";
import { orderBy, query, where } from "firebase/firestore";
import { AttendanceView } from "@/components/features/presence/attendance-view";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessChip } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { StatCard } from "@/components/features/stat-card";
import { DateNav } from "@/components/features/journal/date-nav";
import { useAllPresence } from "@/hooks/use-all-presence";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { awayAt, excusedSeconds, type AwayRequest } from "@/lib/domain/attendance";
import { effectiveStatus, formatDuration, statusLabel, type PresenceState } from "@/lib/domain/presence";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, LeaveRequestDoc, PresenceDailyDoc, UserDoc } from "@/types/models";

const DOT: Record<PresenceState, string> = { online: "bg-success", idle: "bg-warning", break: "bg-info", offline: "bg-muted" };
const PILL: Record<PresenceState, string> = { online: "bg-success/12 text-success", idle: "bg-warning/12 text-warning", break: "bg-info/12 text-info", offline: "bg-surface-raised text-muted" };
const ORDER: Record<PresenceState, number> = { online: 0, idle: 1, break: 2, offline: 3 };

export function PresenceBoard() {
  const now = useNow();
  const today = pktDateString(now);
  const { db } = getFirebase();
  const [businessId, setBusinessId] = useState("");
  const [date, setDate] = useState(today);

  const live = useAllPresence();
  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const totalsQ = useMemo(() => query(orgCollection(db, "presenceDaily"), where("date", "==", date)), [db, date]);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const totals = useCollection<PresenceDailyDoc>(totalsQ);
  // Approved leave and short excuses that reach today or the report day (one inequality; the rest is filtered below).
  const earliest = date < today ? date : today;
  const awayQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("toDate", ">=", earliest)), [db, earliest]);
  const away = useCollection<LeaveRequestDoc>(awayQ);
  const awayByUser = useMemo(() => {
    const map = new Map<string, AwayRequest[]>();
    for (const r of away.data ?? []) if (r.status === "approved") map.set(r.employeeId, [...(map.get(r.employeeId) ?? []), r]);
    return map;
  }, [away.data]);

  const bById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);
  const people = useMemo(() => (users.data ?? []).filter((u) => u.status === "active" && (!businessId || u.businessId === businessId)), [users.data, businessId]);

  const liveRows = useMemo(
    () =>
      people
        .map((u) => {
          const live_ = effectiveStatus(live.nodes[u.id], now.getTime());
          // An approved leave day or short excuse that is happening now shows as a break, whatever the browser says.
          const gone = awayAt(awayByUser.get(u.id) ?? [], now.getTime());
          return { user: u, status: gone ? { ...live_, state: "break" as const, breakType: null } : live_, gone };
        })
        .sort((a, b) => ORDER[a.status.state] - ORDER[b.status.state] || a.user.name.localeCompare(b.user.name)),
    [people, live.nodes, now, awayByUser],
  );
  const count = (s: PresenceState) => liveRows.filter((r) => r.status.state === s).length;

  const reportRows = useMemo(() => {
    const byEmployee = new Map((totals.data ?? []).map((t) => [t.employeeId, t]));
    return people
      .map((u) => {
        const mine = awayByUser.get(u.id) ?? [];
        return {
          user: u,
          t: byEmployee.get(u.id) ?? null,
          excusedSec: excusedSeconds(mine, date),
          onLeave: mine.some((r) => r.kind === "leave" && r.fromDate <= date && date <= r.toDate),
        };
      })
      .sort((a, b) => (b.t?.idleSec ?? -1) - (a.t?.idleSec ?? -1) || a.user.name.localeCompare(b.user.name));
  }, [people, totals.data, awayByUser, date]);

  const error = users.error ?? businesses.error ?? away.error;
  const loading = users.loading || businesses.loading || away.loading;

  return (
    <>
      <PageHeader title="Presence" subtitle="Who is working right now, and how each person's day was spent. Only activity inside Traxio is measured." />
      <div className="mb-4 w-full sm:w-56">
        <Select aria-label="Filter by business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
          <option value="">All businesses</option>
          {(businesses.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState onRetry={() => { users.retry(); businesses.retry(); }} />
      ) : (
        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live">Right now</TabsTrigger>
            <TabsTrigger value="report">Daily report</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Online" value={count("online")} icon={UserCheck} tone="success" loading={loading || !live.ready} />
              <StatCard label="Idle" value={count("idle")} icon={Hourglass} tone="warning" loading={loading || !live.ready} />
              <StatCard label="On break" value={count("break")} icon={Coffee} tone="info" loading={loading || !live.ready} />
              <StatCard label="Offline" value={count("offline")} icon={UserX} tone="brand" loading={loading || !live.ready} />
            </div>
            {live.error ? (
              <ErrorState onRetry={live.retry} />
            ) : loading || !live.ready ? (
              <div aria-busy aria-label="Loading presence" className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-card" />
                ))}
              </div>
            ) : liveRows.length === 0 ? (
              <EmptyState icon={Activity} title="No one to show yet" description="Add team members to a business and their live status appears here." />
            ) : (
              <ul className="space-y-2">
                {liveRows.map(({ user, status, gone }) => {
                  const business = user.businessId ? bById.get(user.businessId) : undefined;
                  return (
                    <li key={user.id}>
                      <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                        <span className="relative shrink-0">
                          <Avatar name={user.name} size="lg" />
                          <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-[3px] ring-surface-solid", DOT[status.state])} />
                        </span>
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="truncate text-[15px] font-semibold leading-tight">{user.name}</p>
                          <div className="mt-1">{business ? <BusinessChip name={business.name} color={business.color} /> : null}</div>
                        </div>
                        <p className={cn("num inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold", PILL[status.state])}>
                          <span aria-hidden className={cn("size-2 rounded-full", DOT[status.state])} />
                          {gone === "leave" ? "On leave" : gone === "excuse" ? "On break · Short excuse" : statusLabel(status, now.getTime())}
                        </p>
                      </GlassCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="report">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-lg font-semibold">{formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM")}</p>
              <DateNav date={date} today={today} onChange={setDate} />
            </div>
            {totals.error ? (
              <ErrorState onRetry={totals.retry} />
            ) : loading || totals.loading ? (
              <div aria-busy aria-label="Loading report" className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-card" />
                ))}
              </div>
            ) : reportRows.length === 0 ? (
              <EmptyState icon={Activity} title="No one to show yet" description="Add team members to a business to see their daily time here." />
            ) : (
              <ul className="space-y-2">
                {reportRows.map(({ user, t, excusedSec, onLeave }) => {
                  const breakSec = (t?.breakSec ?? 0) + excusedSec;
                  const total = t ? t.activeSec + t.idleSec + breakSec : excusedSec;
                  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
                  return (
                    <li key={user.id}>
                      <GlassCard className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Avatar name={user.name} size="lg" />
                          <div className="min-w-0 flex-1 basis-40">
                            <p className="truncate font-semibold">{user.name}</p>
                            {t ? (
                              <p className="num text-xs text-muted">
                                First seen {formatPkt(t.firstSeenAt.toDate(), "h:mm a")} · last seen {formatPkt(t.lastSeenAt.toDate(), "h:mm a")}
                              </p>
                            ) : (
                              <p className="text-xs text-muted">{onLeave ? "On leave" : "Not seen this day"}</p>
                            )}
                          </div>
                          {t || excusedSec > 0 ? (
                            <dl className="num flex gap-4 text-sm">
                              <div>
                                <dt className="text-xs text-muted">Active</dt>
                                <dd className="font-semibold text-success">{formatDuration(t?.activeSec ?? 0)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted">Idle</dt>
                                <dd className="font-semibold text-warning">{formatDuration(t?.idleSec ?? 0)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted">Breaks</dt>
                                <dd className="font-semibold text-info">{formatDuration(breakSec)}</dd>
                              </div>
                            </dl>
                          ) : null}
                        </div>
                        {total > 0 ? (
                          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`${pct(t?.activeSec ?? 0)}% active, ${pct(t?.idleSec ?? 0)}% idle, ${pct(breakSec)}% on break`}>
                            <div className="bg-success" style={{ width: `${pct(t?.activeSec ?? 0)}%` }} />
                            <div className="bg-warning" style={{ width: `${pct(t?.idleSec ?? 0)}%` }} />
                            <div className="bg-info" style={{ width: `${pct(breakSec)}%` }} />
                          </div>
                        ) : null}
                      </GlassCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="attendance">
            <AttendanceView people={people} businesses={businesses.data ?? []} today={today} nowMs={now.getTime()} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
