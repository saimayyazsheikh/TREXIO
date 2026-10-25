"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, CalendarCheck2, CircleCheckBig, Download, NotebookPen } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodPicker, type PeriodState } from "@/components/features/reports/period-picker";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PriorityBadge, pill } from "@/components/features/badges";
import { StatCard } from "@/components/features/stat-card";
import { usePerformanceInput } from "@/hooks/use-performance";
import { useNow } from "@/hooks/use-now";
import { STATUS_LABEL, type DayStatus } from "@/lib/domain/attendance";
import { buildPerformance, type PerformanceTask } from "@/lib/domain/performance";
import { rangeForPeriod } from "@/lib/domain/periods";
import { formatDuration } from "@/lib/domain/presence";
import type { Priority } from "@/lib/domain/constants";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";

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

const dayLabel = (date: string) => formatPkt(pktInstant(date, "12:00"), "EEE d MMM");
const clockOf = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "PM" : "AM"}`;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {hint ? <p className="mb-3 text-sm text-muted">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function TaskList({ items, empty, extra }: { items: PerformanceTask[]; empty: string; extra?: (t: PerformanceTask) => React.ReactNode }) {
  if (items.length === 0) return <p className="rounded-card border border-dashed border-border-solid px-4 py-5 text-center text-sm text-muted">{empty}</p>;
  return (
    <GlassCard className="overflow-hidden">
      <ul className="divide-y divide-border-solid">
        {items.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="min-w-0 flex-1 basis-48 text-sm font-medium">
              {t.title}
              {t.kind === "daily" ? <span className="ml-2 text-xs font-normal text-muted">daily routine</span> : null}
            </span>
            <PriorityBadge priority={t.priority as Priority} />
            <span className="num w-24 shrink-0 text-right text-xs text-muted">{dayLabel(t.date)}</span>
            {extra ? <span className="w-full text-sm text-muted">{extra(t)}</span> : null}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

/**
 * One person's report for a period: the tasks they finished and the ones they didn't, their journal, attendance and time in
 * Traxio. The Download button opens the print dialog, where "Save as PDF" makes the file.
 */
export function PerformanceReport({ employeeId, initialPeriod = "week", fixedRange }: { employeeId: string; initialPeriod?: PeriodState["id"]; /** When the page already has a period filter, the report follows it instead of showing its own. */ fixedRange?: { from: string; to: string } }) {
  const now = useNow();
  const today = pktDateString(now);
  const [period, setPeriod] = useState<PeriodState>({ id: initialPeriod, custom: { from: today, to: today } });
  const own = useMemo(() => rangeForPeriod(period.id, today, period.custom), [period, today]);
  const range = fixedRange ?? own;
  const { input, user, loading, error, retry } = usePerformanceInput(employeeId, range, today, now.getTime());
  const report = useMemo(() => (input ? buildPerformance(input) : null), [input]);

  // The first time a new kind of report is opened, Firebase may still be preparing it for a minute. Keep trying quietly.
  const preparing = (error as { code?: string } | null)?.code === "failed-precondition";
  const again = useRef(retry);
  again.current = retry;
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => again.current(), 15_000);
    return () => clearInterval(timer);
  }, [preparing]);

  const periodText = range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} to ${dayLabel(range.to)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {fixedRange ? <span /> : <PeriodPicker value={period} today={today} onChange={setPeriod} />}
        <Button variant="secondary" disabled={!report} onClick={() => window.print()}>
          <Download aria-hidden /> Download PDF
        </Button>
      </div>

      {preparing ? (
        <GlassCard role="status" className="flex flex-col items-center px-6 py-12 text-center">
          <Skeleton className="mb-4 size-12 rounded-xl" />
          <h2 className="font-display text-lg font-semibold">Getting your report ready</h2>
          <p className="mt-1 max-w-md text-sm text-muted">This is the first time it has been opened, so it needs about a minute to set up. It will load by itself.</p>
        </GlassCard>
      ) : error ? (
        <ErrorState onRetry={retry} />
      ) : loading || !report || !user ? (
        <div aria-busy aria-label="Loading the report" className="space-y-4">
          <Skeleton className="h-24 rounded-card" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : (
        <>
          <GlassCard className="flex flex-wrap items-center gap-4 p-5">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0 flex-1 basis-56">
              <h2 className="truncate font-display text-xl font-semibold">{user.name}</h2>
              <p className="text-sm text-muted">
                {input?.business?.name ? `${input.business.name} · ` : ""}Performance report
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{periodText}</p>
              <p className="num text-xs text-muted">Made {formatPkt(now, "d MMM yyyy, h:mm a")}</p>
            </div>
          </GlassCard>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Tasks finished" value={`${report.tasks.donePct}%`} hint={`${report.tasks.done} of ${report.tasks.assigned}`} icon={CircleCheckBig} tone="success" />
            <StatCard label="Finished on time" value={`${report.tasks.onTimePct}%`} hint={`${report.tasks.onTime} on time, ${report.tasks.late} late`} icon={AlarmClock} tone={report.tasks.late > report.tasks.onTime ? "warning" : "info"} />
            <StatCard label="Journal filled" value={`${report.journal.pct}%`} hint={`${report.journal.filled} of ${report.journal.expected} hours`} icon={NotebookPen} tone="brand" />
            <StatCard label="Days present" value={report.attendance.present + report.attendance.late} hint={`${report.attendance.late} late, ${report.attendance.absent} absent, ${report.attendance.leave + report.attendance.excused} on leave`} icon={CalendarCheck2} tone="info" />
          </div>

          <Section title="Tasks" hint={`${report.tasks.assigned} assigned: ${report.tasks.done} finished, ${report.tasks.open} still open, ${report.tasks.notDone} daily routines not done${report.tasks.blocked ? `, ${report.tasks.blocked} blocked` : ""}.`}>
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Finished ({report.done.length})</h3>
                <TaskList items={report.done} empty="Nothing finished in this period." extra={undefined} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Still open ({report.open.length})</h3>
                <TaskList items={report.open} empty="Nothing left open." extra={(t) => (t.blockedReason ? `Blocked: ${t.blockedReason}` : null)} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Daily routines not done ({report.missed.length})</h3>
                <TaskList items={report.missed} empty="No routines were missed." extra={(t) => (t.missedReason ? `Reason: ${t.missedReason}` : "No reason given.")} />
              </div>
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Journal" hint={report.journal.expected ? `${report.journal.filled} of ${report.journal.expected} working hours have something written.` : "No working days in this period yet."}>
              <GlassCard className="p-4">
                {report.journal.days.length === 0 ? (
                  <p className="text-sm text-muted">Nothing to show.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Journal by day">
                    {report.journal.days.map((d) => {
                      const p = d.expected ? d.filled / d.expected : 0;
                      return (
                        <li key={d.date} title={`${dayLabel(d.date)}: ${d.filled} of ${d.expected} hours`} className={cn("size-5 rounded-[5px]", p >= 0.8 ? "bg-success" : p >= 0.4 ? "bg-warning" : p > 0 ? "bg-danger/70" : "bg-danger")}>
                          <span className="sr-only">{`${d.date}: ${d.filled} of ${d.expected} hours`}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </GlassCard>
            </Section>

            <Section title="Time in Traxio" hint={report.presence.daysSeen ? `Seen on ${report.presence.daysSeen} ${report.presence.daysSeen === 1 ? "day" : "days"}, about ${formatDuration(report.presence.avgActiveSec)} active a day.` : "Not seen in this period."}>
              <GlassCard className="p-4">
                <dl className="num grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Active</dt>
                    <dd className="text-lg font-semibold text-success">{formatDuration(report.presence.activeSec)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Idle</dt>
                    <dd className="text-lg font-semibold text-warning">{formatDuration(report.presence.idleSec)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Breaks</dt>
                    <dd className="text-lg font-semibold text-info">{formatDuration(report.presence.breakSec)}</dd>
                  </div>
                </dl>
              </GlassCard>
            </Section>
          </div>

          <Section title="Attendance" hint={report.attendance.avgCheckInMin === null ? "No arrivals recorded." : `Usually starts around ${clockOf(report.attendance.avgCheckInMin)}.`}>
            <GlassCard className="p-4">
              <ul className="flex flex-wrap gap-1" aria-label="Attendance by day">
                {report.attendance.days.map(({ date, result }) => (
                  <li key={date} title={`${dayLabel(date)}: ${STATUS_LABEL[result.status]}`} className={cn("size-5 rounded-[5px]", DOT[result.status])}>
                    <span className="sr-only">{`${date}: ${STATUS_LABEL[result.status]}`}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Key">
                {(["present", "late", "absent", "leave", "off"] as DayStatus[]).map((s) => (
                  <li key={s} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={cn("size-3 rounded-[4px]", s === "off" ? "border border-border-solid bg-surface-raised" : DOT[s])} />
                    {STATUS_LABEL[s]}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className={cn(pill, "bg-success/12 text-success")}>{report.attendance.present} on time</span>
                <span className={cn(pill, "bg-warning/12 text-warning")}>{report.attendance.late} late</span>
                <span className={cn(pill, "bg-danger/12 text-danger")}>{report.attendance.absent} absent</span>
                <span className={cn(pill, "bg-info/12 text-info")}>{report.attendance.leave + report.attendance.excused} on leave</span>
              </p>
            </GlassCard>
          </Section>
        </>
      )}
    </div>
  );
}
