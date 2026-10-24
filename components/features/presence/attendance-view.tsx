"use client";

import { useMemo, useState } from "react";
import { AlarmClock, CalendarOff, ChevronLeft, ChevronRight, ClipboardCheck, UserCheck, UserX } from "lucide-react";
import { query, where } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessChip, pill } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { StatCard } from "@/components/features/stat-card";
import { DateNav } from "@/components/features/journal/date-nav";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { STATUS_LABEL, attendanceForDay, summarize, type DayResult, type DayStatus } from "@/lib/domain/attendance";
import { effectiveHours, isWorkingDay } from "@/lib/domain/journal";
import { formatDuration } from "@/lib/domain/presence";
import { isClosedFor } from "@/lib/domain/timeoff";
import { formatPkt, pktDateString, pktInstant, pktHour, pktMinute } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, CalendarDoc, LeaveRequestDoc, PresenceDailyDoc, UserDoc, WithId } from "@/types/models";

const PILL: Record<DayStatus, string> = {
  present: "bg-success/12 text-success",
  late: "bg-warning/12 text-warning",
  absent: "bg-danger/12 text-danger",
  leave: "bg-info/12 text-info",
  excused: "bg-info/12 text-info",
  off: "bg-surface-raised text-muted",
  upcoming: "bg-surface-raised text-muted",
  before: "bg-surface-raised text-muted",
};
const DOT: Record<DayStatus, string> = {
  present: "bg-success",
  late: "bg-warning",
  absent: "bg-danger",
  leave: "bg-info",
  excused: "bg-info/50",
  off: "bg-surface-raised",
  upcoming: "border border-border-solid",
  before: "bg-transparent",
};
const ORDER: Record<DayStatus, number> = { absent: 0, late: 1, present: 2, excused: 3, leave: 4, upcoming: 5, off: 6, before: 7 };

const clock = (ms: number) => formatPkt(new Date(ms), "h:mm a");
const minuteOfDay = (ms: number) => pktHour(new Date(ms)) * 60 + pktMinute(new Date(ms));
const clockOfMinutes = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "PM" : "AM"}`;

const monthOf = (date: string) => date.slice(0, 7);
const monthDays = (month: string): string[] => {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Who came in and when. A person's login is the first time they were seen in Traxio that day and their logout is the last,
 * both already recorded by presence. Approved leave and the business calendar decide who was expected.
 */
export function AttendanceView({ people, businesses, today, nowMs }: { people: WithId<UserDoc>[]; businesses: WithId<BusinessDoc>[]; today: string; nowMs: number }) {
  const { db } = getFirebase();
  const [mode, setMode] = useState<"day" | "month">("day");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(monthOf(today));

  const from = mode === "day" ? date : `${month}-01`;
  const to = mode === "day" ? date : monthDays(month).at(-1)!;

  const presenceQ = useMemo(() => query(orgCollection(db, "presenceDaily"), where("date", ">=", from), where("date", "<=", to)), [db, from, to]);
  const calendarQ = useMemo(() => query(orgCollection(db, "calendar"), where("date", ">=", from), where("date", "<=", to)), [db, from, to]);
  // One inequality only (no composite index needed); the rest is filtered here.
  const leaveQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("toDate", ">=", from)), [db, from]);
  const presence = useCollection<PresenceDailyDoc>(presenceQ);
  const calendar = useCollection<CalendarDoc>(calendarQ);
  const leave = useCollection<LeaveRequestDoc>(leaveQ);

  const bById = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);
  const dates = useMemo(() => (mode === "day" ? [date] : monthDays(month)), [mode, date, month]);

  const rows = useMemo(() => {
    const seen = new Map<string, PresenceDailyDoc>((presence.data ?? []).map((p) => [`${p.employeeId}_${p.date}`, p]));
    const entries = (calendar.data ?? []).map((c) => ({ date: c.date, businessId: c.businessId }));
    const approved = (leave.data ?? []).filter((r) => r.status === "approved" && r.fromDate <= to);
    return people.map((user) => {
      const business = user.businessId ? bById.get(user.businessId) : undefined;
      const mine = approved.filter((r) => r.employeeId === user.id);
      const days: { date: string; result: DayResult }[] = dates.map((d) => {
        const p = seen.get(`${user.id}_${d}`);
        const result = attendanceForDay({
          date: d,
          today,
          nowMs,
          working: !!business && isWorkingDay(business.workDays, d) && !isClosedFor(d, business.id, entries),
          hours: business ? effectiveHours(user, business) : { start: "09:00", end: "18:00" },
          presence: p ? { firstSeenMs: p.firstSeenAt.toMillis(), lastSeenMs: p.lastSeenAt.toMillis(), activeSec: p.activeSec, idleSec: p.idleSec, breakSec: p.breakSec } : null,
          leave: mine.some((r) => r.kind === "leave" && r.fromDate <= d && d <= r.toDate),
          excuse: mine.some((r) => r.kind === "excuse" && r.fromDate === d),
          joined: user.createdAt ? pktDateString(user.createdAt.toDate()) : undefined,
        });
        return { date: d, result };
      });
      return { user, business, days, summary: summarize(days.map((x) => x.result), minuteOfDay) };
    });
  }, [people, bById, dates, presence.data, calendar.data, leave.data, today, nowMs, to]);

  const error = presence.error ?? calendar.error ?? leave.error;
  const loading = presence.loading || calendar.loading || leave.loading;

  const dayRows = useMemo(() => rows.map((r) => ({ ...r, result: r.days[0].result })).sort((a, b) => ORDER[a.result.status] - ORDER[b.result.status] || a.user.name.localeCompare(b.user.name)), [rows]);
  const count = (s: DayStatus) => dayRows.filter((r) => r.result.status === s).length;

  const monthLabel = formatPkt(pktInstant(`${month}-15`, "12:00"), "MMMM yyyy");
  const atCurrent = month >= monthOf(today);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Attendance view" className="inline-flex rounded-full border border-border-solid bg-surface-raised p-0.5">
          {(["day", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn("h-8 rounded-full px-4 text-sm font-medium transition-colors", mode === m ? "bg-surface-solid text-foreground shadow-[var(--shadow-1)]" : "text-muted hover:text-foreground")}
            >
              {m === "day" ? "One day" : "Whole month"}
            </button>
          ))}
        </div>
        {mode === "day" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-display text-lg font-semibold">{formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM")}</p>
            <DateNav date={date} today={today} onChange={setDate} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="min-w-36 text-right font-display text-lg font-semibold">{monthLabel}</p>
            <Button variant="secondary" size="icon" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Next month" disabled={atCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <ErrorState onRetry={() => { presence.retry(); calendar.retry(); leave.retry(); }} />
      ) : loading ? (
        <div aria-busy aria-label="Loading attendance" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No one to show yet" description="Add team members to a business and their attendance appears here." />
      ) : mode === "day" ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Present" value={count("present")} icon={UserCheck} tone="success" />
            <StatCard label="Late" value={count("late")} icon={AlarmClock} tone="warning" />
            <StatCard label="Absent" value={count("absent")} icon={UserX} tone="danger" alert={count("absent") > 0} />
            <StatCard label="On leave" value={count("leave") + count("excused")} icon={CalendarOff} tone="info" />
          </div>
          <ul className="space-y-2">
            {dayRows.map(({ user, business, result }) => (
              <li key={user.id}>
                <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                  <Avatar name={user.name} size="lg" />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-[15px] font-semibold leading-tight">{user.name}</p>
                    <div className="mt-1">{business ? <BusinessChip name={business.name} color={business.color} /> : null}</div>
                  </div>
                  {result.checkInMs !== null && result.checkOutMs !== null ? (
                    <dl className="num flex gap-5 text-sm">
                      <div>
                        <dt className="text-xs text-muted">In</dt>
                        <dd className="font-semibold">{clock(result.checkInMs)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Last seen</dt>
                        <dd className="font-semibold">{clock(result.checkOutMs)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Active</dt>
                        <dd className="font-semibold">{formatDuration(result.activeSec)}</dd>
                      </div>
                    </dl>
                  ) : null}
                  <span className={cn(pill, PILL[result.status])}>
                    {STATUS_LABEL[result.status]}
                    {result.status === "late" ? ` · ${formatDuration(result.lateMin * 60)}` : ""}
                  </span>
                </GlassCard>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <GlassCard className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border-solid text-xs font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3">Team member</th>
                <th scope="col" className="px-2 py-3">Days</th>
                <th scope="col" className="px-2 py-3 text-right">Present</th>
                <th scope="col" className="px-2 py-3 text-right">Late</th>
                <th scope="col" className="px-2 py-3 text-right">Absent</th>
                <th scope="col" className="px-2 py-3 text-right">Leave</th>
                <th scope="col" className="px-4 py-3 text-right">Usual start</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-solid">
              {rows.map(({ user, business, days, summary }) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-tight">{user.name}</p>
                        {business ? <p className="truncate text-xs text-muted">{business.name}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <ul className="flex flex-wrap gap-[3px]" aria-label={`${user.name}: day by day`}>
                      {days.map(({ date: d, result }) => (
                        <li key={d} title={`${formatPkt(pktInstant(d, "12:00"), "EEE d MMM")}: ${STATUS_LABEL[result.status]}`} className={cn("size-3.5 rounded-[4px]", DOT[result.status])}>
                          <span className="sr-only">{`${d}: ${STATUS_LABEL[result.status]}`}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="num px-2 py-3 text-right font-semibold text-success">{summary.present}</td>
                  <td className="num px-2 py-3 text-right font-semibold text-warning">{summary.late}</td>
                  <td className="num px-2 py-3 text-right font-semibold text-danger">{summary.absent}</td>
                  <td className="num px-2 py-3 text-right font-semibold text-info">{summary.leave + summary.excused}</td>
                  <td className="num px-4 py-3 text-right">{summary.avgCheckInMin === null ? "–" : clockOfMinutes(summary.avgCheckInMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-solid px-4 py-3 text-xs text-muted" aria-label="Key">
            {(["present", "late", "absent", "leave", "off"] as DayStatus[]).map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-3 rounded-[4px]", s === "off" ? "border border-border-solid bg-surface-raised" : DOT[s])} />
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </>
  );
}
