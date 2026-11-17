"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, CheckCheck, ChevronLeft, ChevronRight, ClipboardCopy, ListChecks, MessageCircle, Printer, TriangleAlert, UserX } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessChip, pill } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { StatCard } from "@/components/features/stat-card";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { useNow } from "@/hooks/use-now";
import { STATUS_LABEL, type DayStatus } from "@/lib/domain/attendance";
import { buildDayDigest, digestText, type DayLine } from "@/lib/domain/day-digest";
import { buildTeamReports } from "@/lib/domain/performance";
import { formatDuration } from "@/lib/domain/presence";
import { shareLink } from "@/lib/domain/whatsapp-link";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktDateString, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<DayStatus, string> = {
  present: "bg-success/14 text-success",
  late: "bg-warning/14 text-warning",
  absent: "bg-danger/14 text-danger",
  leave: "bg-info/14 text-info",
  excused: "bg-info/14 text-info",
  off: "bg-surface-raised text-muted",
  upcoming: "bg-surface-raised text-muted",
  before: "bg-surface-raised text-muted",
};

const clock = (ms: number) => formatPkt(new Date(ms), "h:mm a");
const shift = (date: string, days: number) => dateStringFromDayIndex(dayIndexFromDateString(date) + days);

function PersonCard({ line, color }: { line: DayLine; color?: string }) {
  const issues = line.notDone.length + line.doneLate.length + line.blocked.length;
  return (
    <GlassCard className="p-4 break-inside-avoid">
      <div className="flex items-start gap-3">
        <Avatar name={line.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{line.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {line.business ? <BusinessChip name={line.business} color={color ?? "indigo"} /> : null}
            <span className={cn(pill, STATUS_TONE[line.status])}>
              {STATUS_LABEL[line.status]}
              {line.status === "late" && line.lateMin ? ` · ${line.lateMin}m` : ""}
            </span>
            {line.checkInMs && (line.status === "present" || line.status === "late") ? <span className="num text-xs text-muted">in at {clock(line.checkInMs)}</span> : null}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Tasks", `${line.done}/${line.assigned}`],
          ["Journal", `${line.journal.filled}/${line.journal.expected}h`],
          ["Active", formatDuration(line.activeSec)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-control bg-surface-raised/60 px-1 py-2">
            <dd className="num text-base font-semibold leading-none">{value}</dd>
            <dt className="mt-1 text-[11px] text-muted">{label}</dt>
          </div>
        ))}
      </dl>

      {issues > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {line.notDone.map((n) => (
            <li key={`nd-${n.title}`} className="rounded-control bg-danger/10 px-3 py-2">
              <span className="font-semibold text-danger">Not done:</span> {n.title}
              <span className="block text-muted">{n.reason ? `Reason: ${n.reason}` : "No reason given yet"}</span>
            </li>
          ))}
          {line.doneLate.map((n) => (
            <li key={`dl-${n.title}`} className="rounded-control bg-warning/12 px-3 py-2">
              <span className="font-semibold text-warning">Finished late:</span> {n.title}
              {n.reason ? <span className="block text-muted">Reason: {n.reason}</span> : null}
            </li>
          ))}
          {line.blocked.map((n) => (
            <li key={`bl-${n.title}`} className="rounded-control bg-status-blocked/12 px-3 py-2">
              <span className="font-semibold text-status-blocked">Blocked:</span> {n.title}
              <span className="block text-muted">{n.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </GlassCard>
  );
}

/** One day for the whole team on a page: who was in, what got done, what didn't and why. Copy it, send it on WhatsApp, or print it. */
export function DailyReportView({ initialDate }: { initialDate?: string }) {
  const now = useNow();
  const today = pktDateString(now);
  const valid = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && initialDate <= today ? initialDate : today;
  const [date, setDate] = useState(valid);
  const [businessId, setBusinessId] = useState("");
  const data = useAnalyticsData({ from: date, to: date }, businessId);
  const nowMs = now.getTime();

  const digest = useMemo(() => {
    if (!data.team) return null;
    const people = data.people
      .filter((u) => u.status === "active" && (!businessId || u.businessId === businessId))
      .map((u) => ({ id: u.id, name: u.name, businessId: u.businessId, workStart: u.workStart, workEnd: u.workEnd, joinedOn: u.createdAt ? pktDateString(u.createdAt.toDate()) : undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const reports = buildTeamReports({
      from: date,
      to: date,
      today,
      nowMs,
      people,
      businesses: data.businesses.map((b) => ({ id: b.id, name: b.name, workDays: b.workDays, workStart: b.workStart, workEnd: b.workEnd })),
      ...data.team,
    });
    return buildDayDigest(date, reports);
    // The clock only matters to the minute for this report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.team, data.people, data.businesses, businessId, date, today, Math.floor(nowMs / 60_000)]);

  const colorOf = useMemo(() => new Map(data.businesses.map((b) => [b.name, b.color])), [data.businesses]);
  const title = date === today ? "Today" : date === shift(today, -1) ? "Yesterday" : formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM");

  async function copy() {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digestText(digest));
      toast.success("Report copied. Paste it anywhere.");
    } catch {
      toast.error("Couldn't copy. Use the WhatsApp button instead.");
    }
  }

  const actions = (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="secondary" disabled={!digest} onClick={copy}>
        <ClipboardCopy aria-hidden /> Copy
      </Button>
      <Button asChild variant="secondary" disabled={!digest}>
        <a href={digest ? shareLink(digestText(digest)) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!digest}>
          <MessageCircle aria-hidden /> WhatsApp
        </a>
      </Button>
      <Button variant="secondary" disabled={!digest} onClick={() => window.print()}>
        <Printer aria-hidden /> Print
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Daily report" subtitle="How the day went, for everyone in one place: who was in, what got done, what didn't, and why." actions={actions} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => setDate(shift(date, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <Input aria-label="Day" type="date" max={today} value={date} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} className="w-44" />
          <Button variant="secondary" size="icon" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shift(date, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="ghost" disabled={date === shift(today, -1)} onClick={() => setDate(shift(today, -1))}>
            Yesterday
          </Button>
          <Button variant="ghost" disabled={date === today} onClick={() => setDate(today)}>
            Today
          </Button>
        </div>
        {data.businesses.length > 1 ? (
          <Select aria-label="Business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">All businesses</option>
            {data.businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <h2 className="mb-4 font-display text-xl font-semibold">
        {title}
        {title !== formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM") ? <span className="ml-2 text-base font-normal text-muted">{formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM")}</span> : null}
      </h2>

      {data.error ? (
        <ErrorState onRetry={data.retry} />
      ) : data.loading || !digest ? (
        <div aria-busy aria-label="Loading the report" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : digest.lines.length === 0 ? (
        <EmptyState icon={ListChecks} title="No team members to report on" description="Add your team, or choose another business." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Tasks done" value={`${digest.totals.done}/${digest.totals.assigned}`} hint={digest.totals.doneLate ? `${digest.totals.doneLate} finished late` : "On time"} icon={CheckCheck} tone="success" />
            <StatCard
              label="Routines not done"
              value={digest.totals.notDone}
              hint={digest.totals.needReason ? `${digest.totals.needReason} without a reason` : digest.totals.notDone ? "All explained" : "None missed"}
              icon={TriangleAlert}
              tone={digest.totals.notDone > 0 ? "danger" : "success"}
              alert={digest.totals.needReason > 0}
            />
            <StatCard label="In today" value={digest.totals.present + digest.totals.late} hint={digest.totals.late ? `${digest.totals.late} late` : "Nobody late"} icon={CalendarCheck2} tone="info" />
            <StatCard label="Absent" value={digest.totals.absent} hint={digest.totals.onLeave ? `${digest.totals.onLeave} on leave` : "Nobody on leave"} icon={UserX} tone={digest.totals.absent > 0 ? "warning" : "success"} />
          </div>

          <ul className="grid gap-4 lg:grid-cols-2 print:grid-cols-1">
            {digest.lines.map((l) => (
              <li key={l.id}>
                <PersonCard line={l} color={l.business ? colorOf.get(l.business) : undefined} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
