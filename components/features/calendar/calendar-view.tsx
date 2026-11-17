"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, PlaneTakeoff } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge, StatusBadge } from "@/components/features/badges";
import { ErrorState } from "@/components/features/error-state";
import { PageHeader } from "@/components/features/page-header";
import { BlockDialog } from "@/components/features/tasks/block-dialog";
import { TaskDrawer } from "@/components/features/tasks/task-drawer";
import { TaskSheet } from "@/components/features/tasks/task-sheet";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { useTaskActions } from "@/hooks/use-task-actions";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { addMonths, monthGrid, monthRange, monthStart } from "@/lib/domain/calendar-grid";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, CalendarDoc, LeaveRequestDoc, TaskDoc, UserDoc, WithId } from "@/types/models";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITY_DOT: Record<string, string> = { high: "bg-priority-high", medium: "bg-priority-medium", low: "bg-priority-low" };
const dayLabel = (date: string) => formatPkt(pktInstant(date, "12:00"), "EEEE, d MMMM");

/** A month of one-off tasks, holidays, closures and approved leave. Open a day to see it all, or to hand out a task for it. */
export function CalendarView() {
  const { db } = getFirebase();
  const now = useNow();
  const today = pktDateString(now);
  const [month, setMonth] = useState(() => monthStart(pktDateString()));
  const [businessId, setBusinessId] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<WithId<TaskDoc> | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; task?: WithId<TaskDoc>; date?: string }>({ open: false });

  const { from, to } = useMemo(() => monthRange(month), [month]);
  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("date", ">=", from), where("date", "<=", to), orderBy("date", "asc"), limit(1500)), [db, from, to]);
  const calendarQ = useMemo(() => query(orgCollection(db, "calendar"), where("date", ">=", from), where("date", "<=", to)), [db, from, to]);
  const leaveQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("toDate", ">=", from)), [db, from]);
  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const tasks = useCollection<TaskDoc>(tasksQ);
  const calendar = useCollection<CalendarDoc>(calendarQ);
  const leave = useCollection<LeaveRequestDoc>(leaveQ);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const error = tasks.error ?? calendar.error ?? leave.error ?? users.error ?? businesses.error;
  const loading = tasks.loading || calendar.loading || leave.loading || users.loading || businesses.loading;
  const viewer = { uid: "admin", role: "admin" as const };
  const { displayStatus, move, tickSubtask, savingSubtasks } = useTaskActions(viewer, tasks.data ?? []);

  // Daily routines would bury the month, so it shows one-off tasks; routines live on Kanban and Workload.
  const byDay = useMemo(() => {
    const map = new Map<string, WithId<TaskDoc>[]>();
    for (const t of tasks.data ?? []) {
      if (t.kind !== "oneoff" || (businessId && t.businessId !== businessId)) continue;
      map.set(t.date, [...(map.get(t.date) ?? []), t]);
    }
    return map;
  }, [tasks.data, businessId]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarDoc[]>();
    for (const c of calendar.data ?? []) {
      if (businessId && c.businessId && c.businessId !== businessId) continue;
      map.set(c.date, [...(map.get(c.date) ?? []), c]);
    }
    return map;
  }, [calendar.data, businessId]);

  const leaveOn = (date: string) =>
    (leave.data ?? []).filter((r) => r.status === "approved" && r.kind === "leave" && r.fromDate <= date && date <= r.toDate && (!businessId || r.businessId === businessId));

  const businessById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const monthLabel = formatPkt(pktInstant(month, "12:00"), "MMMM yyyy");
  const selected = selectedId ? ((tasks.data ?? []).find((t) => t.id === selectedId) ?? null) : null;
  const dayTasks = openDay ? (byDay.get(openDay) ?? []) : [];

  // Only one-off tasks are on this page, so editing always opens the task form.
  const editTask = (t: WithId<TaskDoc>) => {
    setSelectedId(null);
    setSheet({ open: true, task: t });
  };

  const chip = (t: WithId<TaskDoc>) => (
    <span key={t.id} className="flex min-w-0 items-center gap-1.5 rounded-md bg-surface-raised/70 px-1.5 py-0.5 text-xs">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} />
      <span className={cn("truncate", displayStatus(t) === "completed" && "text-muted line-through")}>{t.title}</span>
    </span>
  );

  const days = weeks.flat().filter((d) => d.inMonth);
  const busyDays = days.filter((d) => (byDay.get(d.date)?.length ?? 0) + (entriesByDay.get(d.date)?.length ?? 0) + leaveOn(d.date).length > 0);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="One-off tasks, holidays and leave for the month. Open a day to see it, or to give someone a task for it."
        actions={
          <Button onClick={() => setSheet({ open: true, date: today })}>
            <Plus aria-hidden /> Assign a task
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-40 text-center font-display text-lg font-semibold">{monthLabel}</h2>
          <Button variant="secondary" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="ghost" onClick={() => setMonth(monthStart(today))} disabled={month === monthStart(today)}>
            This month
          </Button>
        </div>
        {(businesses.data?.length ?? 0) > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Business</span>
            <Select aria-label="Business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">All businesses</option>
              {(businesses.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      {error ? (
        <ErrorState onRetry={() => { tasks.retry(); calendar.retry(); leave.retry(); users.retry(); businesses.retry(); }} />
      ) : loading ? (
        <Skeleton aria-busy aria-label="Loading the calendar" className="h-[32rem] rounded-card" />
      ) : (
        <>
          {/* Wide screens: the month as a grid. */}
          <div className="hidden overflow-hidden rounded-card border border-border-solid md:block">
            <div className="grid grid-cols-7 border-b border-border-solid bg-surface-raised/50">
              {WEEKDAYS.map((d) => (
                <p key={d} className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {d}
                </p>
              ))}
            </div>
            {weeks.map((week, w) => (
              <div key={w} className="grid grid-cols-7 border-b border-border-solid last:border-b-0">
                {week.map((d) => {
                  const list = byDay.get(d.date) ?? [];
                  const entries = entriesByDay.get(d.date) ?? [];
                  const away = leaveOn(d.date).length;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setOpenDay(d.date)}
                      aria-label={`${dayLabel(d.date)}: ${list.length} ${list.length === 1 ? "task" : "tasks"}${entries.length ? `, ${entries.map((e) => e.name).join(", ")}` : ""}`}
                      className={cn(
                        "flex min-h-28 flex-col gap-1 border-r border-border-solid p-1.5 text-left outline-none transition-colors last:border-r-0 hover:bg-surface-raised/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                        !d.inMonth && "bg-surface-raised/30 text-muted",
                        entries.length > 0 && d.inMonth && "bg-warning/6",
                      )}
                    >
                      <span className={cn("num flex size-6 items-center justify-center rounded-full text-xs font-semibold", d.date === today && "bg-brand text-brand-fg")}>{Number(d.date.slice(8))}</span>
                      {entries.map((e) => (
                        <span key={e.name + e.businessId} className="truncate rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                          {e.name}
                        </span>
                      ))}
                      {list.slice(0, 3).map(chip)}
                      {list.length > 3 ? <span className="px-1 text-xs font-medium text-muted">+{list.length - 3} more</span> : null}
                      {away > 0 ? (
                        <span className="mt-auto flex items-center gap-1 px-1 text-xs text-info">
                          <PlaneTakeoff className="size-3" aria-hidden /> {away} on leave
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Phones: only the days that have something, as a list. */}
          <div className="space-y-2 md:hidden">
            {busyDays.length === 0 ? <p className="rounded-card border border-dashed border-border-solid px-4 py-10 text-center text-sm text-muted">Nothing planned in {monthLabel}.</p> : null}
            {busyDays.map((d) => {
              const list = byDay.get(d.date) ?? [];
              const entries = entriesByDay.get(d.date) ?? [];
              const away = leaveOn(d.date).length;
              return (
                <button key={d.date} type="button" onClick={() => setOpenDay(d.date)} className="block w-full rounded-card border border-border-solid p-3 text-left transition-colors hover:bg-surface-raised/60">
                  <p className={cn("text-sm font-semibold", d.date === today && "text-brand-text")}>{dayLabel(d.date)}</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {entries.map((e) => (
                      <span key={e.name + e.businessId} className="truncate rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                        {e.name}
                      </span>
                    ))}
                    {list.slice(0, 4).map(chip)}
                    {list.length > 4 ? <span className="text-xs font-medium text-muted">+{list.length - 4} more</span> : null}
                    {away > 0 ? <span className="text-xs text-info">{away} on leave</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <Sheet open={openDay !== null} onOpenChange={(o) => !o && setOpenDay(null)}>
        {openDay ? (
          <SheetContent
            title={dayLabel(openDay)}
            description={openDay === today ? "Today" : openDay < today ? "A day that has passed" : "Coming up"}
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpenDay(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    const date = openDay;
                    setOpenDay(null);
                    setSheet({ open: true, date });
                  }}
                  disabled={openDay < today}
                >
                  <Plus aria-hidden /> Assign a task for this day
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-5">
              {(entriesByDay.get(openDay) ?? []).map((e) => (
                <p key={e.name + e.businessId} className="rounded-control bg-warning/12 px-3 py-2 text-sm text-warning">
                  <span className="font-semibold">{e.type === "holiday" ? "Holiday" : "Closed"}:</span> {e.name}
                  {e.businessId ? ` (${businessById.get(e.businessId)?.name ?? "one business"})` : " (everyone)"}
                </p>
              ))}
              {leaveOn(openDay).length > 0 ? (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-info">
                  <PlaneTakeoff className="size-4" aria-hidden /> On leave: {leaveOn(openDay).map((r) => r.employeeName).join(", ")}
                </p>
              ) : null}
              {dayTasks.length === 0 ? (
                <p className="rounded-card border border-dashed border-border-solid px-4 py-8 text-center text-sm text-muted">No one-off tasks on this day.</p>
              ) : (
                <ul className="space-y-2">
                  {dayTasks.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDay(null);
                          setSelectedId(t.id);
                        }}
                        className="w-full rounded-control border border-border-solid p-3 text-left transition-colors hover:bg-surface-raised/60"
                      >
                        <p className={cn("font-medium leading-snug", displayStatus(t) === "completed" && "text-muted line-through")}>{t.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <PriorityBadge priority={t.priority} />
                          <StatusBadge status={displayStatus(t)} />
                          <span className="text-xs text-muted">{t.assigneeIds.map((id) => t.assigneeNames[id] ?? "Teammate").join(", ")}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SheetContent>
        ) : null}
      </Sheet>

      <TaskDrawer
        task={selected}
        status={selected ? displayStatus(selected) : "todo"}
        viewer={viewer}
        business={selected ? businessById.get(selected.businessId) : undefined}
        now={now}
        today={today}
        savingSubtasks={savingSubtasks}
        onClose={() => setSelectedId(null)}
        onMove={(task, status, opts) => void move({ ...task, status: displayStatus(task) }, status, opts ? { kind: opts.kind } : {})}
        onBlock={setBlocking}
        onToggleSubtask={tickSubtask}
        onEdit={editTask}
      />
      <BlockDialog
        title={blocking?.title ?? null}
        onOpenChange={(o) => !o && setBlocking(null)}
        onConfirm={(reason) => (blocking ? move({ ...blocking, status: displayStatus(blocking) }, "blocked", { reason }) : Promise.resolve(false))}
      />
      <TaskSheet
        open={sheet.open}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        task={sheet.task}
        employees={users.data ?? []}
        businesses={businesses.data ?? []}
        prefill={sheet.date && !sheet.task ? { title: "", description: "", date: sheet.date } : undefined}
      />
    </>
  );
}
