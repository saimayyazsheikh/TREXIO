"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/features/glass-card";
import { pill } from "@/components/features/badges";
import { STATUS_LABEL, type DayStatus } from "@/lib/domain/attendance";
import { toCsv } from "@/lib/domain/csv";
import type { PersonReport } from "@/lib/domain/performance";
import { formatDuration } from "@/lib/domain/presence";
import { formatPkt, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";

type Range = { from: string; to: string };
type Props = { reports: PersonReport[]; range: Range };

const dayLabel = (date: string) => formatPkt(pktInstant(date, "12:00"), "EEE d MMM");
const clockOf = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "PM" : "AM"}`;
const hours = (sec: number) => Math.round((sec / 3600) * 10) / 10;

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

function download(name: string, csv: string, count: number) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${count} ${count === 1 ? "person" : "people"}.`);
}

function Frame({ title, hint, onExport, disabled, children }: { title: string; hint: string; onExport: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        <Button variant="secondary" disabled={disabled} onClick={onExport} className="print:hidden">
          <Download aria-hidden /> Export CSV
        </Button>
      </div>
      {children}
    </section>
  );
}

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th scope="col" className={cn("px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted", right && "text-right")}>
    {children}
  </th>
);

function Table({ head, children, empty }: { head: React.ReactNode; children: React.ReactNode; empty: boolean }) {
  return (
    <GlassCard className="overflow-x-auto p-0">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border-solid">{head}</tr>
        </thead>
        <tbody className="divide-y divide-border-solid">{children}</tbody>
      </table>
      {empty ? <p className="px-4 py-8 text-center text-sm text-muted">No team members in this view.</p> : null}
    </GlassCard>
  );
}

const Who = ({ r }: { r: PersonReport }) => (
  <th scope="row" className="px-3 py-2.5 font-medium">
    <span className="block leading-tight">{r.person.name}</span>
    {r.business ? <span className="text-xs font-normal text-muted">{r.business.name}</span> : null}
  </th>
);

/** Tasks per person, and the reasons routines weren't done. */
export function TasksReport({ reports, range }: Props) {
  const missed = reports
    .flatMap((r) => r.report.missed.map((t) => ({ ...t, who: r.person.name })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60);

  return (
    <Frame
      title="Tasks"
      hint="What each person was given, what they finished, and what didn't get done."
      disabled={reports.length === 0}
      onExport={() =>
        download(
          `traxio-tasks-${range.from}_to_${range.to}.csv`,
          toCsv(
            ["Person", "Business", "Assigned", "Finished", "Open", "Not done (routines)", "Blocked", "On time", "Late", "Finished %"],
            reports.map((r) => [r.person.name, r.business?.name ?? "", r.report.tasks.assigned, r.report.tasks.done, r.report.tasks.open, r.report.tasks.notDone, r.report.tasks.blocked, r.report.tasks.onTime, r.report.tasks.late, r.report.tasks.donePct]),
          ),
          reports.length,
        )
      }
    >
      <Table empty={reports.length === 0} head={<><Th>Person</Th><Th right>Assigned</Th><Th right>Finished</Th><Th right>Open</Th><Th right>Not done</Th><Th right>Blocked</Th><Th right>On time</Th><Th right>Finished %</Th></>}>
        {reports.map((r) => (
          <tr key={r.person.id}>
            <Who r={r} />
            <td className="num px-3 py-2.5 text-right">{r.report.tasks.assigned}</td>
            <td className="num px-3 py-2.5 text-right">{r.report.tasks.done}</td>
            <td className="num px-3 py-2.5 text-right">{r.report.tasks.open}</td>
            <td className={cn("num px-3 py-2.5 text-right", r.report.tasks.notDone > 0 && "font-semibold text-danger")}>{r.report.tasks.notDone}</td>
            <td className="num px-3 py-2.5 text-right">{r.report.tasks.blocked}</td>
            <td className="num px-3 py-2.5 text-right">{r.report.tasks.onTime + r.report.tasks.late > 0 ? `${r.report.tasks.onTimePct}%` : "n/a"}</td>
            <td className="num px-3 py-2.5 text-right font-semibold">{r.report.tasks.donePct}%</td>
          </tr>
        ))}
      </Table>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Why routines weren&apos;t done ({missed.length})</h3>
        {missed.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-solid px-4 py-5 text-center text-sm text-muted">No daily routines were missed in this period.</p>
        ) : (
          <GlassCard className="overflow-hidden">
            <ul className="divide-y divide-border-solid">
              {missed.map((t) => (
                <li key={`${t.id}-${t.who}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                  <span className="num w-24 shrink-0 text-xs text-muted">{dayLabel(t.date)}</span>
                  <span className="w-32 shrink-0 font-medium">{t.who}</span>
                  <span className="min-w-0 flex-1 basis-40">{t.title}</span>
                  <span className={cn("basis-full text-sm sm:basis-auto sm:max-w-sm", t.missedReason ? "text-muted" : "text-danger")}>{t.missedReason ?? "No reason given"}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>
    </Frame>
  );
}

/** Journal hours per person, with a square for each working day. */
export function JournalsReport({ reports, range }: Props) {
  return (
    <Frame
      title="Journals"
      hint="Working hours with something written. Each square is a working day: green is mostly filled, red is empty."
      disabled={reports.length === 0}
      onExport={() =>
        download(
          `traxio-journals-${range.from}_to_${range.to}.csv`,
          toCsv(["Person", "Business", "Hours logged", "Hours expected", "Filled %"], reports.map((r) => [r.person.name, r.business?.name ?? "", r.report.journal.filled, r.report.journal.expected, r.report.journal.pct])),
          reports.length,
        )
      }
    >
      <Table empty={reports.length === 0} head={<><Th>Person</Th><Th>Days</Th><Th right>Logged</Th><Th right>Expected</Th><Th right>Filled %</Th></>}>
        {reports.map((r) => (
          <tr key={r.person.id}>
            <Who r={r} />
            <td className="px-3 py-2.5">
              <ul className="flex flex-wrap gap-[3px]" aria-label={`${r.person.name}: journal by day`}>
                {r.report.journal.days.map((d) => {
                  const p = d.expected ? d.filled / d.expected : 0;
                  return (
                    <li key={d.date} title={`${dayLabel(d.date)}: ${d.filled} of ${d.expected} hours`} className={cn("size-3.5 rounded-[4px]", p >= 0.8 ? "bg-success" : p >= 0.4 ? "bg-warning" : p > 0 ? "bg-danger/70" : "bg-danger")}>
                      <span className="sr-only">{`${d.date}: ${d.filled} of ${d.expected} hours`}</span>
                    </li>
                  );
                })}
              </ul>
            </td>
            <td className="num px-3 py-2.5 text-right">{r.report.journal.filled}</td>
            <td className="num px-3 py-2.5 text-right">{r.report.journal.expected}</td>
            <td className="num px-3 py-2.5 text-right font-semibold">{r.report.journal.expected ? `${r.report.journal.pct}%` : "n/a"}</td>
          </tr>
        ))}
      </Table>
    </Frame>
  );
}

/** Attendance per person: who came in, who was late, who was away. */
export function AttendanceReport({ reports, range }: Props) {
  return (
    <Frame
      title="Attendance"
      hint="From the first time each person was seen in Traxio each day, approved leave and the business calendar."
      disabled={reports.length === 0}
      onExport={() =>
        download(
          `traxio-attendance-${range.from}_to_${range.to}.csv`,
          toCsv(
            ["Person", "Business", "On time", "Late", "Absent", "On leave", "Usual start"],
            reports.map((r) => [r.person.name, r.business?.name ?? "", r.report.attendance.present, r.report.attendance.late, r.report.attendance.absent, r.report.attendance.leave + r.report.attendance.excused, r.report.attendance.avgCheckInMin === null ? "" : clockOf(r.report.attendance.avgCheckInMin)]),
          ),
          reports.length,
        )
      }
    >
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border-solid">
              <Th>Person</Th>
              <Th>Days</Th>
              <Th right>On time</Th>
              <Th right>Late</Th>
              <Th right>Absent</Th>
              <Th right>Leave</Th>
              <Th right>Usual start</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-solid">
            {reports.map((r) => (
              <tr key={r.person.id}>
                <Who r={r} />
                <td className="px-3 py-2.5">
                  <ul className="flex flex-wrap gap-[3px]" aria-label={`${r.person.name}: attendance by day`}>
                    {r.report.attendance.days.map(({ date, result }) => (
                      <li key={date} title={`${dayLabel(date)}: ${STATUS_LABEL[result.status]}`} className={cn("size-3.5 rounded-[4px]", DOT[result.status])}>
                        <span className="sr-only">{`${date}: ${STATUS_LABEL[result.status]}`}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="num px-3 py-2.5 text-right font-semibold text-success">{r.report.attendance.present}</td>
                <td className="num px-3 py-2.5 text-right font-semibold text-warning">{r.report.attendance.late}</td>
                <td className="num px-3 py-2.5 text-right font-semibold text-danger">{r.report.attendance.absent}</td>
                <td className="num px-3 py-2.5 text-right font-semibold text-info">{r.report.attendance.leave + r.report.attendance.excused}</td>
                <td className="num px-3 py-2.5 text-right">{r.report.attendance.avgCheckInMin === null ? "–" : clockOf(r.report.attendance.avgCheckInMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">No team members in this view.</p> : null}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-solid px-4 py-3 text-xs text-muted" aria-label="Key">
          {(["present", "late", "absent", "leave", "off"] as DayStatus[]).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-3 rounded-[4px]", s === "off" ? "border border-border-solid bg-surface-raised" : DOT[s])} />
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
      </GlassCard>
    </Frame>
  );
}

/** Time inside Traxio per person: active, idle and on a break. */
export function PresenceReport({ reports, range }: Props) {
  return (
    <Frame
      title="Presence"
      hint="Active, idle and break hours over the period. Only whether the computer is in use is measured, never what is on screen."
      disabled={reports.length === 0}
      onExport={() =>
        download(
          `traxio-presence-${range.from}_to_${range.to}.csv`,
          toCsv(
            ["Person", "Business", "Active h", "Idle h", "Break h", "Days seen", "Average active h per day"],
            reports.map((r) => [r.person.name, r.business?.name ?? "", hours(r.report.presence.activeSec), hours(r.report.presence.idleSec), hours(r.report.presence.breakSec), r.report.presence.daysSeen, hours(r.report.presence.avgActiveSec)]),
          ),
          reports.length,
        )
      }
    >
      <Table empty={reports.length === 0} head={<><Th>Person</Th><Th>Share of time</Th><Th right>Active</Th><Th right>Idle</Th><Th right>Breaks</Th><Th right>Days seen</Th><Th right>Active a day</Th></>}>
        {reports.map((r) => {
          const p = r.report.presence;
          const total = p.activeSec + p.idleSec + p.breakSec;
          const pc = (n: number) => (total ? (n / total) * 100 : 0);
          return (
            <tr key={r.person.id}>
              <Who r={r} />
              <td className="px-3 py-2.5">
                {total > 0 ? (
                  <div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`${Math.round(pc(p.activeSec))}% active, ${Math.round(pc(p.idleSec))}% idle, ${Math.round(pc(p.breakSec))}% on break`}>
                    <div className="bg-success" style={{ width: `${pc(p.activeSec)}%` }} />
                    <div className="bg-warning" style={{ width: `${pc(p.idleSec)}%` }} />
                    <div className="bg-info" style={{ width: `${pc(p.breakSec)}%` }} />
                  </div>
                ) : (
                  <span className={cn(pill, "bg-surface-raised text-muted")}>Not seen</span>
                )}
              </td>
              <td className="num px-3 py-2.5 text-right font-semibold text-success">{formatDuration(p.activeSec)}</td>
              <td className="num px-3 py-2.5 text-right font-semibold text-warning">{formatDuration(p.idleSec)}</td>
              <td className="num px-3 py-2.5 text-right font-semibold text-info">{formatDuration(p.breakSec)}</td>
              <td className="num px-3 py-2.5 text-right">{p.daysSeen}</td>
              <td className="num px-3 py-2.5 text-right">{p.daysSeen ? formatDuration(p.avgActiveSec) : "–"}</td>
            </tr>
          );
        })}
      </Table>
    </Frame>
  );
}
