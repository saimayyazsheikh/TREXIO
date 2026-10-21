"use client";

import { useMemo, useState } from "react";
import { Activity, Coffee, Moon, Radio, WifiOff } from "lucide-react";
import { collection, orderBy, query, where } from "firebase/firestore";
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
import { effectiveStatus, formatDuration, statusLabel, type PresenceState } from "@/lib/domain/presence";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, PresenceDailyDoc, UserDoc } from "@/types/models";

const DOT: Record<PresenceState, string> = { online: "bg-success", idle: "bg-warning", break: "bg-info", offline: "bg-muted" };
const ORDER: Record<PresenceState, number> = { online: 0, idle: 1, break: 2, offline: 3 };

export function PresenceBoard() {
  const now = useNow();
  const today = pktDateString(now);
  const { db } = getFirebase();
  const [businessId, setBusinessId] = useState("");
  const [date, setDate] = useState(today);

  const live = useAllPresence();
  const usersQ = useMemo(() => query(collection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(collection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const totalsQ = useMemo(() => query(collection(db, "presenceDaily"), where("date", "==", date)), [db, date]);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const totals = useCollection<PresenceDailyDoc>(totalsQ);

  const bById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);
  const people = useMemo(() => (users.data ?? []).filter((u) => u.status === "active" && (!businessId || u.businessId === businessId)), [users.data, businessId]);

  const liveRows = useMemo(
    () =>
      people
        .map((u) => ({ user: u, status: effectiveStatus(live.nodes[u.id], now.getTime()) }))
        .sort((a, b) => ORDER[a.status.state] - ORDER[b.status.state] || a.user.name.localeCompare(b.user.name)),
    [people, live.nodes, now],
  );
  const count = (s: PresenceState) => liveRows.filter((r) => r.status.state === s).length;

  const reportRows = useMemo(() => {
    const byEmployee = new Map((totals.data ?? []).map((t) => [t.employeeId, t]));
    return people
      .map((u) => ({ user: u, t: byEmployee.get(u.id) ?? null }))
      .sort((a, b) => (b.t?.idleSec ?? -1) - (a.t?.idleSec ?? -1) || a.user.name.localeCompare(b.user.name));
  }, [people, totals.data]);

  const error = users.error ?? businesses.error;
  const loading = users.loading || businesses.loading;

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
          </TabsList>

          <TabsContent value="live">
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Online" value={count("online")} icon={Radio} tone="success" loading={loading || !live.ready} />
              <StatCard label="Idle" value={count("idle")} icon={Moon} tone="warning" loading={loading || !live.ready} />
              <StatCard label="On break" value={count("break")} icon={Coffee} tone="info" loading={loading || !live.ready} />
              <StatCard label="Offline" value={count("offline")} icon={WifiOff} tone="brand" loading={loading || !live.ready} />
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
                {liveRows.map(({ user, status }) => {
                  const business = user.businessId ? bById.get(user.businessId) : undefined;
                  return (
                    <li key={user.id}>
                      <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                        <Avatar name={user.name} src={user.photoUrl} />
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="truncate font-semibold">{user.name}</p>
                          <div className="mt-0.5">{business ? <BusinessChip name={business.name} color={business.color} /> : null}</div>
                        </div>
                        <p className="inline-flex items-center gap-2 text-sm font-medium">
                          <span aria-hidden className={cn("size-2.5 rounded-full", DOT[status.state])} />
                          <span className="num">{statusLabel(status, now.getTime())}</span>
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
              <p className="font-display text-lg font-bold">{formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM")}</p>
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
                {reportRows.map(({ user, t }) => {
                  const total = t ? t.activeSec + t.idleSec + t.breakSec : 0;
                  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
                  return (
                    <li key={user.id}>
                      <GlassCard className="p-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Avatar name={user.name} src={user.photoUrl} />
                          <div className="min-w-0 flex-1 basis-40">
                            <p className="truncate font-semibold">{user.name}</p>
                            {t ? (
                              <p className="num text-xs text-muted">
                                First seen {formatPkt(t.firstSeenAt.toDate(), "h:mm a")} · last seen {formatPkt(t.lastSeenAt.toDate(), "h:mm a")}
                              </p>
                            ) : (
                              <p className="text-xs text-muted">Not seen this day</p>
                            )}
                          </div>
                          {t ? (
                            <dl className="num flex gap-4 text-sm">
                              <div>
                                <dt className="text-xs text-muted">Active</dt>
                                <dd className="font-semibold text-success">{formatDuration(t.activeSec)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted">Idle</dt>
                                <dd className="font-semibold text-warning">{formatDuration(t.idleSec)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted">Breaks</dt>
                                <dd className="font-semibold text-info">{formatDuration(t.breakSec)}</dd>
                              </div>
                            </dl>
                          ) : null}
                        </div>
                        {t && total > 0 ? (
                          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`${pct(t.activeSec)}% active, ${pct(t.idleSec)}% idle, ${pct(t.breakSec)}% on break`}>
                            <div className="bg-success" style={{ width: `${pct(t.activeSec)}%` }} />
                            <div className="bg-warning" style={{ width: `${pct(t.idleSec)}%` }} />
                            <div className="bg-info" style={{ width: `${pct(t.breakSec)}%` }} />
                          </div>
                        ) : null}
                      </GlassCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
