"use client";

import { useMemo, useState } from "react";
import { orderBy, query, where } from "firebase/firestore";
import { Activity, BarChart3, CalendarCheck2, CircleCheckBig, Download, NotebookPen, OctagonX, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceReport, JournalsReport, PresenceReport, TasksReport } from "@/components/features/analytics/team-reports";
import { PerformanceReport } from "@/components/features/reports/performance-report";
import { PeriodPicker, type PeriodState } from "@/components/features/reports/period-picker";
import { ChartCard } from "@/components/features/analytics/chart-card";
import { Heatmap, HBarChart, OnTimeChart, SERIES, TimeUseChart, TrendChart } from "@/components/features/analytics/charts";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { StatCard } from "@/components/features/stat-card";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import type { BusinessDoc, UserDoc } from "@/types/models";
import { useNow } from "@/hooks/use-now";
import { computeAnalytics, employeesCsv, toHours, WEEKDAY_LABELS, type AnalyticsInput } from "@/lib/domain/analytics";
import { buildTeamReports } from "@/lib/domain/performance";
import { rangeForPeriod } from "@/lib/domain/periods";
import { pktDateString } from "@/lib/time";
import { cn } from "@/lib/utils";

type TabId = "overview" | "tasks" | "journals" | "attendance" | "presence" | "person";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "journals", label: "Journals" },
  { id: "attendance", label: "Attendance" },
  { id: "presence", label: "Presence" },
  { id: "person", label: "One person" },
];

/** Period, business and person filters sit in one row above everything they scope; each report has its own tab. */
export function AnalyticsView() {
  const now = useNow();
  const today = pktDateString(now);
  const [period, setPeriod] = useState<PeriodState>({ id: "last30", custom: { from: today, to: today } });
  const [businessId, setBusinessId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const range = useMemo(() => rangeForPeriod(period.id, today, period.custom), [period, today]);
  const { db } = getFirebase();
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const staffQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const staff = useCollection<UserDoc>(staffQ);
  const choices = (staff.data ?? []).filter((u) => u.status === "active" && (!businessId || u.businessId === businessId)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How work is going. Pick a period, a business or a person, then open the report you need."
        actions={
          <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
            <Printer aria-hidden /> Print or save as PDF
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden" role="group" aria-label="Filters">
        <PeriodPicker value={period} today={today} onChange={setPeriod} />
        <div className="w-full sm:w-52">
          <Select
            aria-label="Filter by business"
            value={businessId}
            onChange={(e) => {
              setBusinessId(e.target.value);
              setEmployeeId("");
            }}
          >
            <option value="">All businesses</option>
            {(businesses.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-52">
          <Select aria-label="Filter by person" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Everyone</option>
            {choices.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="mb-4 hidden text-sm text-muted print:block">
        {range.from} to {range.to}
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="print:hidden" aria-label="Reports">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          <AnalyticsBody key={`${range.from}_${range.to}`} range={range} businessId={businessId} employeeId={employeeId} tab={tab} today={today} nowMs={now.getTime()} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AnalyticsBody({ range, businessId, employeeId, tab, today, nowMs }: { range: { from: string; to: string }; businessId: string; employeeId: string; tab: TabId; today: string; nowMs: number }) {
  const data = useAnalyticsData(range, businessId);
  const bName = useMemo(() => new Map(data.businesses.map((b) => [b.id, b.name])), [data.businesses]);

  // One person: everything is narrowed to them (tasks they are on, their time and journal).
  const input = useMemo<AnalyticsInput | null>(() => {
    if (!data.input || !employeeId) return data.input;
    const i = data.input;
    return {
      ...i,
      people: i.people.filter((p) => p.id === employeeId),
      tasks: i.tasks.filter((t) => t.assigneeIds.includes(employeeId)),
      presence: i.presence.filter((p) => p.employeeId === employeeId),
      journals: i.journals.filter((j) => j.employeeId === employeeId),
    };
  }, [data.input, employeeId]);
  const a = useMemo(() => (input ? computeAnalytics(input) : null), [input]);

  const reports = useMemo(() => {
    if (!data.team) return null;
    const people = data.people
      .filter((u) => u.status === "active" && (!businessId || u.businessId === businessId) && (!employeeId || u.id === employeeId))
      .map((u) => ({ id: u.id, name: u.name, businessId: u.businessId, workStart: u.workStart, workEnd: u.workEnd, joinedOn: u.createdAt ? pktDateString(u.createdAt.toDate()) : undefined }))
      .sort((x, y) => x.name.localeCompare(y.name));
    return buildTeamReports({
      from: range.from,
      to: range.to,
      today,
      nowMs,
      people,
      businesses: data.businesses.map((b) => ({ id: b.id, name: b.name, workDays: b.workDays, workStart: b.workStart, workEnd: b.workEnd })),
      ...data.team,
    });
    // The clock only matters to the minute for these reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.team, data.people, data.businesses, businessId, employeeId, range.from, range.to, today, Math.floor(nowMs / 60_000)]);

  if (data.error) return <ErrorState onRetry={data.retry} />;
  if (data.loading || !a) {
    return (
      <div aria-busy aria-label="Loading analytics" className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    );
  }
  if (tab === "person") {
    return employeeId ? <PerformanceReport employeeId={employeeId} fixedRange={range} /> : <EmptyState icon={BarChart3} title="Choose a person" description="Pick someone in the Person filter above to see their own report: tasks finished and not, journal, attendance and time in Traxio." />;
  }
  if (tab !== "overview") {
    if (!reports) return <Skeleton className="h-72 rounded-card" />;
    return (
      <div>
        {tab === "tasks" ? <TasksReport reports={reports} range={range} /> : null}
        {tab === "journals" ? <JournalsReport reports={reports} range={range} /> : null}
        {tab === "attendance" ? <AttendanceReport reports={reports} range={range} /> : null}
        {tab === "presence" ? <PresenceReport reports={reports} range={range} /> : null}
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-5">
        <StatCard label="Tasks completed" value={`${k.completedPct}%`} hint={`${k.completed} of ${k.total}`} icon={CircleCheckBig} tone="success" />
        <StatCard label="Finished on time" value={`${k.onTimePct}%`} hint={`${k.onTime} on time, ${k.late} late`} icon={CalendarCheck2} tone={k.late > k.onTime ? "warning" : "info"} />
        <StatCard label="Active per day" value={`${k.avgActiveHours}h`} hint="Average per person seen" icon={Activity} tone="brand" />
        <StatCard label="Journal filled" value={`${k.journalPct}%`} hint="Of expected working hours" icon={NotebookPen} tone="info" />
        <StatCard label="Times blocked" value={k.blocked} hint="Tasks marked blocked" icon={OctagonX} tone="danger" alert={k.blocked > 0} />
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
