"use client";

import { useMemo, useState } from "react";
import { collection, orderBy, query } from "firebase/firestore";
import { BarChart3, CircleCheck, Clock3, Download, NotebookPen, OctagonAlert, Printer, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/features/analytics/chart-card";
import { Heatmap, HBarChart, OnTimeChart, SERIES, TimeUseChart, TrendChart } from "@/components/features/analytics/charts";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { StatCard } from "@/components/features/stat-card";
import { shiftDate } from "@/components/features/journal/date-nav";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import type { BusinessDoc } from "@/types/models";
import { useNow } from "@/hooks/use-now";
import { computeAnalytics, employeesCsv, toHours, WEEKDAY_LABELS } from "@/lib/domain/analytics";
import { pktDateString } from "@/lib/time";
import { cn } from "@/lib/utils";

const PRESETS = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

/** Filters live in one row above everything they scope. Changing the period remounts the body so numbers never mix periods. */
export function AnalyticsView() {
  const now = useNow();
  const today = pktDateString(now);
  const [days, setDays] = useState<number>(30);
  const [businessId, setBusinessId] = useState("");
  const range = { from: shiftDate(today, -(days - 1)), to: today };
  const { db } = getFirebase();
  const businessesQ = useMemo(() => query(collection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How work is going: completion, timing, time use, journals and what keeps getting blocked."
        actions={
          <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
            <Printer aria-hidden /> Print or save as PDF
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden" role="group" aria-label="Filters">
        <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1 rounded-control border border-border-solid p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              role="radio"
              aria-checked={days === p.days}
              onClick={() => setDays(p.days)}
              className={cn("min-h-10 rounded-lg px-3 text-sm font-medium transition-colors", days === p.days ? "bg-brand-gradient text-white" : "text-muted hover:bg-surface-raised hover:text-foreground")}
            >
              {p.label}
            </button>
          ))}
        </div>
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
      <p className="mb-4 hidden text-sm text-muted print:block">
        {range.from} to {range.to}
      </p>
      <AnalyticsBody key={`${range.from}_${range.to}`} range={range} businessId={businessId} />
    </>
  );
}

function AnalyticsBody({ range, businessId }: { range: { from: string; to: string }; businessId: string }) {
  const data = useAnalyticsData(range, businessId);
  const bName = useMemo(() => new Map(data.businesses.map((b) => [b.id, b.name])), [data.businesses]);

  const a = useMemo(() => (data.input ? computeAnalytics(data.input) : null), [data.input]);

  if (data.error) return <ErrorState onRetry={data.retry} />;
  if (data.loading || !a) {
    return (
      <div aria-busy aria-label="Loading analytics" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    );
  }
  if (a.kpis.total === 0 && a.employees.every((e) => e.activeSec === 0)) {
    return <EmptyState icon={BarChart3} title="Nothing to chart yet" description="Once your team has tasks and has worked in Traxio during this period, the numbers and charts appear here. Try a longer period." />;
  }

  const k = a.kpis;
  const noTasks = k.total === 0;
  const trendTable = a.trend.points.map((p) => [p.label, p.total, p.completed, p.completedPct === null ? "n/a" : `${p.completedPct}%`, p.onTime, p.late]);

  function exportCsv() {
    const csv = employeesCsv(a!.employees, range, (id) => (id ? (bName.get(id) ?? "") : ""));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = `traxio-analytics-${range.from}_to_${range.to}.csv`;
    el.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${a!.employees.length} ${a!.employees.length === 1 ? "person" : "people"}.`);
  }

  return (
    <div className="space-y-5">
      {data.truncated ? (
        <p role="status" className="rounded-control bg-warning/10 px-3 py-2 text-sm text-warning">
          This period has more records than can be loaded at once, so the numbers may be partial. Try a shorter period.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <StatCard label="Tasks completed" value={`${k.completedPct}%`} hint={`${k.completed} of ${k.total}`} icon={CircleCheck} tone="success" />
        <StatCard label="Finished on time" value={`${k.onTimePct}%`} hint={`${k.onTime} on time, ${k.late} late`} icon={Clock3} tone={k.late > k.onTime ? "warning" : "info"} />
        <StatCard label="Active per day" value={`${k.avgActiveHours}h`} hint="Average per person seen" icon={Timer} tone="brand" />
        <StatCard label="Journal filled" value={`${k.journalPct}%`} hint="Of expected working hours" icon={NotebookPen} tone="info" />
        <StatCard label="Times blocked" value={k.blocked} hint="Tasks marked blocked" icon={OctagonAlert} tone={k.blocked ? "warning" : "info"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Completion over time"
          subtitle={`Share of each ${a.trend.granularity}'s tasks that got finished`}
          empty={noTasks ? "No tasks in this period." : undefined}
          table={{ columns: [a.trend.granularity === "week" ? "Week" : "Day", "Tasks", "Completed", "Rate", "On time", "Late"], rows: trendTable }}
        >
          <TrendChart points={a.trend.points} />
        </ChartCard>

        <ChartCard
          title="On time versus late"
          subtitle="Finished by the due time, or finished late / still open past it"
          legend={[
            { label: "On time", color: SERIES[0] },
            { label: "Late or overdue", color: SERIES[1] },
          ]}
          empty={k.onTime + k.late === 0 ? "No tasks with a due time in this period." : undefined}
          table={{ columns: [a.trend.granularity === "week" ? "Week" : "Day", "On time", "Late or overdue"], rows: a.trend.points.map((p) => [p.label, p.onTime, p.late]) }}
        >
          <OnTimeChart points={a.trend.points} />
        </ChartCard>

        <ChartCard
          title="Completion by person"
          subtitle="Share of each person's tasks they finished"
          empty={a.employees.every((e) => e.assigned === 0) ? "Nobody was assigned tasks in this period." : undefined}
          table={{ columns: ["Person", "Assigned", "Done", "Rate"], rows: a.employees.map((e) => [e.name, e.assigned, e.done, `${e.donePct}%`]) }}
        >
          <HBarChart data={a.employees.filter((e) => e.assigned > 0).map((e) => ({ name: e.name, value: e.donePct }))} unit="%" max={100} label="Completed" />
        </ChartCard>

        <ChartCard
          title="Active, idle and break time"
          subtitle="Hours inside Traxio over the period"
          legend={[
            { label: "Active", color: SERIES[0] },
            { label: "Idle", color: SERIES[1] },
            { label: "On break", color: SERIES[2] },
          ]}
          empty={a.employees.every((e) => e.activeSec + e.idleSec + e.breakSec === 0) ? "No time was recorded in this period." : undefined}
          table={{ columns: ["Person", "Active h", "Idle h", "Break h", "Days seen"], rows: a.employees.map((e) => [e.name, toHours(e.activeSec), toHours(e.idleSec), toHours(e.breakSec), e.daysSeen]) }}
        >
          <TimeUseChart data={a.employees.filter((e) => e.activeSec + e.idleSec + e.breakSec > 0).map((e) => ({ name: e.name, active: toHours(e.activeSec), idle: toHours(e.idleSec), break: toHours(e.breakSec) }))} />
        </ChartCard>

        <ChartCard
          title="Journal fill rate"
          subtitle="Working hours with something written, by person"
          empty={a.employees.every((e) => e.journalExpected === 0) ? "No working days in this period yet." : undefined}
          table={{ columns: ["Person", "Hours logged", "Hours expected", "Rate"], rows: a.employees.map((e) => [e.name, e.journalFilled, e.journalExpected, `${e.journalPct}%`]) }}
        >
          <HBarChart data={a.employees.filter((e) => e.journalExpected > 0).map((e) => ({ name: e.name, value: e.journalPct }))} unit="%" max={100} label="Journal filled" />
        </ChartCard>

        <ChartCard
          title="What gets blocked"
          subtitle="Most common reasons given when a task was blocked"
          empty={a.blockedReasons.length === 0 ? "No tasks were blocked in this period." : undefined}
          table={{ columns: ["Reason", "Times"], rows: a.blockedReasons.map((r) => [r.reason, r.count]) }}
        >
          <HBarChart data={a.blockedReasons.map((r) => ({ name: r.reason, value: r.count }))} label="Times blocked" labelWidth={200} />
        </ChartCard>
      </div>

      <ChartCard
        title="Workload by weekday"
        subtitle="How many tasks each person was given on each day of the week"
        empty={noTasks ? "No tasks in this period." : undefined}
        table={{ columns: ["Person", ...WEEKDAY_LABELS], rows: a.workload.map((w) => [w.name, ...w.counts]) }}
      >
        <Heatmap rows={a.workload} />
      </ChartCard>

      <section aria-labelledby="by-person">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="by-person" className="font-display text-lg font-semibold">
            By person
          </h2>
          <Button variant="secondary" disabled={a.employees.length === 0} onClick={exportCsv} className="print:hidden">
            <Download aria-hidden /> Export CSV
          </Button>
        </div>
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border-solid">
                {["Person", "Business", "Assigned", "Done", "Rate", "Active h", "Journal"].map((c, i) => (
                  <th key={c} scope="col" className={cn("px-3 py-2.5 font-semibold", i > 1 && "text-right")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.employees.map((e) => (
                <tr key={e.id} className="border-t border-border-solid">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {e.name}
                  </th>
                  <td className="px-3 py-2 text-muted">{e.businessId ? (bName.get(e.businessId) ?? "") : ""}</td>
                  <td className="num px-3 py-2 text-right">{e.assigned}</td>
                  <td className="num px-3 py-2 text-right">{e.done}</td>
                  <td className="num px-3 py-2 text-right font-semibold">{e.donePct}%</td>
                  <td className="num px-3 py-2 text-right">{toHours(e.activeSec)}</td>
                  <td className="num px-3 py-2 text-right">{e.journalExpected ? `${e.journalPct}%` : "n/a"}</td>
                </tr>
              ))}
              {a.employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    No team members in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </GlassCard>
      </section>
    </div>
  );
}
