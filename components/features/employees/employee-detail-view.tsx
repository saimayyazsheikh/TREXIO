"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, CircleCheck, CircleSlash, ClipboardList, ListPlus, Pause, Pencil, Play, Plus, Repeat, ThumbsDown, ThumbsUp, Trash2, UserX } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { BusinessChip, PriorityBadge, StatusBadge } from "@/components/features/badges";
import { ConfirmDialog } from "@/components/features/confirm-dialog";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { EmployeeJournalTab } from "@/components/features/journal/employee-journal-tab";
import { TaskSheet } from "@/components/features/tasks/task-sheet";
import { TemplateSheet } from "@/components/features/tasks/template-sheet";
import { DueChip } from "@/components/features/tasks/due-chip";
import { useCollection } from "@/hooks/use-collection";
import { useDocument } from "@/hooks/use-document";
import { useNow } from "@/hooks/use-now";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { businessColorVar } from "@/lib/domain/business-colors";
import { isMissed } from "@/lib/domain/tasks";
import { compareTasks } from "@/lib/domain/task-sort";
import { describeWorkDays } from "@/lib/domain/work-days";
import { transitionTask } from "@/lib/tasks-client";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktDateString } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, TaskDoc, TemplateDoc, UserDoc, WithId } from "@/types/models";

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(`${date}T12:00:00+05:00`);
  if (date === pktDateString(new Date(new Date(`${today}T12:00:00+05:00`).getTime() - 86_400_000))) return "Yesterday";
  return formatPkt(d, "EEE, d MMM");
}

export function EmployeeDetailView({ employeeId }: { employeeId: string }) {
  const now = useNow();
  const today = pktDateString(now);
  const { db } = getFirebase();

  const userRef = useMemo(() => orgDocument(db, "users", employeeId), [db, employeeId]);
  const employee = useDocument<UserDoc>(userRef);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const employeesQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const templatesQ = useMemo(() => query(orgCollection(db, "taskTemplates"), where("employeeId", "==", employeeId)), [db, employeeId]);
  const tasksQ = useMemo(() => query(orgCollection(db, "tasks"), where("assigneeIds", "array-contains", employeeId), orderBy("date", "desc"), limit(100)), [db, employeeId]);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const employees = useCollection<UserDoc>(employeesQ);
  const templates = useCollection<TemplateDoc>(templatesQ);
  const tasks = useCollection<TaskDoc>(tasksQ);

  const [taskSheet, setTaskSheet] = useState<{ open: boolean; task?: WithId<TaskDoc> }>({ open: false });
  const [templateSheet, setTemplateSheet] = useState<{ open: boolean; template?: WithId<TemplateDoc>; todayTask?: WithId<TaskDoc> }>({ open: false });
  const [deletingTask, setDeletingTask] = useState<WithId<TaskDoc> | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<WithId<TemplateDoc> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "review" | "completed">("");

  const business = employee.data?.businessId ? businesses.data?.find((b) => b.id === employee.data?.businessId) : undefined;

  const groups = useMemo(() => {
    const visible = (tasks.data ?? []).filter((t) => t.kind === "oneoff").filter((t) => (statusFilter === "open" ? t.status !== "completed" : statusFilter === "review" ? t.status === "under_review" : statusFilter === "completed" ? t.status === "completed" : true));
    const byDate = new Map<string, WithId<TaskDoc>[]>();
    for (const t of visible) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
    return [...byDate.entries()].map(([date, list]) => ({
      date,
      list: [...list].sort((a, b) => compareTasks({ ...a, dueAtMs: a.dueAt?.toMillis() ?? null }, { ...b, dueAtMs: b.dueAt?.toMillis() ?? null })),
    }));
  }, [tasks.data, statusFilter]);

  // Daily routines are shown on their own tab: the routine itself, how today's copy is going, and the last week of copies.
  const weekAgo = dateStringFromDayIndex(dayIndexFromDateString(today) - 6);
  const oneoffCount = (tasks.data ?? []).filter((t) => t.kind === "oneoff").length;
  const copies = useMemo(
    () =>
      (tasks.data ?? [])
        .filter((t) => t.kind === "daily" && t.date >= weekAgo)
        .sort((a, b) => b.date.localeCompare(a.date) || (a.dueAt?.toMillis() ?? Infinity) - (b.dueAt?.toMillis() ?? Infinity)),
    [tasks.data, weekAgo],
  );
  const todaysCopy = (templateId: string) => copies.find((c) => c.templateId === templateId && c.date === today);
  const copyState = (t: WithId<TaskDoc>) => (t.status === "completed" ? "done" : isMissed({ kind: t.kind, status: t.status, dueAtMs: t.dueAt?.toMillis() ?? null, date: t.date }, now.getTime(), today) ? "missed" : "open");

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
      throw error;
    }
  }

  const sortedTemplates = [...(templates.data ?? [])].sort((a, b) => a.order - b.order);

  const error = employee.error ?? businesses.error ?? employees.error;
  if (error) return <ErrorState onRetry={() => { employee.retry(); businesses.retry(); employees.retry(); }} />;
  if (employee.loading || businesses.loading) {
    return (
      <div aria-busy aria-label="Loading team member" className="space-y-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  const person = employee.data;
  if (!person || person.role !== "employee") {
    return (
      <EmptyState
        icon={UserX}
        title="We can't find that team member"
        description="They may have been removed, or the link is wrong."
        action={<Button asChild><Link href="/admin/settings/team">Back to Team</Link></Button>}
      />
    );
  }

  const off = person.status === "disabled";

  return (
    <>
      <Link href="/admin/settings/team" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Team
      </Link>

      <GlassCard accent={business ? businessColorVar(business.color) : undefined} className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <Avatar name={person.name} size="lg" ringColor={business ? businessColorVar(business.color) : undefined} />
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="truncate font-display text-2xl font-semibold">{person.name}</h1>
          <p className="truncate text-sm text-muted">
            @{person.username}
            {person.designation ? ` · ${person.designation}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {business ? <BusinessChip name={business.name} color={business.color} /> : null}
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", off ? "bg-danger/15 text-danger" : "bg-success/15 text-success")}>
              {off ? <CircleSlash className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
              {off ? "Turned off" : "Active"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setTaskSheet({ open: true })} disabled={off}>
            <ListPlus aria-hidden /> Assign task
          </Button>
          <Button variant="secondary" onClick={() => setTemplateSheet({ open: true })} disabled={off}>
            <Repeat aria-hidden /> Add daily routine
          </Button>
        </div>
      </GlassCard>

      <Tabs defaultValue="tasks">
        <TabsList aria-label="Work">
          <TabsTrigger value="tasks">
            One-off tasks <span className="num ml-1 text-xs opacity-70">{oneoffCount}</span>
          </TabsTrigger>
          <TabsTrigger value="routines">
            Daily routines <span className="num ml-1 text-xs opacity-70">{sortedTemplates.length}</span>
          </TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <p className="mb-4 text-sm text-muted">Work you gave {person.name.split(" ")[0]} for a single day. Things that repeat every day are on the Daily routines tab.</p>
          {tasks.error ? (
            <ErrorState onRetry={tasks.retry} />
          ) : tasks.loading ? (
            <div aria-busy aria-label="Loading tasks" className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-card" />
              ))}
            </div>
          ) : oneoffCount === 0 ? (
            <EmptyState icon={ClipboardList} title="No one-off tasks yet" description={`Assign ${person.name.split(" ")[0]} a task for a single day. For work that repeats, add a daily routine.`} action={<Button onClick={() => setTaskSheet({ open: true })} disabled={off}><Plus aria-hidden /> Assign task</Button>} />
          ) : (
            <>
              <div className="mb-4 max-w-56">
                <Select aria-label="Filter tasks" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="">All tasks</option>
                  <option value="open">Not finished</option>
                  <option value="review">Waiting for my review</option>
                  <option value="completed">Completed</option>
                </Select>
              </div>
              {groups.length === 0 ? (
                <EmptyState icon={ClipboardList} title="Nothing matches that filter" description="Try another filter to see more of their tasks." />
              ) : (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.date} aria-labelledby={`day-${g.date}`}>
                      <h2 id={`day-${g.date}`} className="mb-2 font-display text-base font-semibold text-muted">
                        {dayLabel(g.date, today)}
                      </h2>
                      <ul className="space-y-2">
                        {g.list.map((t) => (
                          <li key={t.id}>
                            <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                              <div className="min-w-0 flex-1 basis-56">
                                <p className="flex items-center gap-2 font-semibold">
                                  <span className="truncate">{t.title}</span>
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <PriorityBadge priority={t.priority} />
                                  <StatusBadge status={t.status} />
                                  <DueChip task={t} status={t.status} now={now} today={today} />
                                  {t.subtaskTotal > 0 ? (
                                    <span className="num inline-flex items-center gap-1 text-xs text-muted">
                                      <CalendarCheck className="size-3.5" aria-hidden /> {t.subtaskDone}/{t.subtaskTotal} steps
                                    </span>
                                  ) : null}
                                </div>
                                {t.status === "blocked" && t.blockedReason ? <p className="mt-1.5 text-sm text-status-blocked">Blocked: {t.blockedReason}</p> : null}
                              </div>
                              <div className="ml-auto flex flex-wrap items-center">
                                {t.status === "under_review" ? (
                                  <>
                                    <Button size="sm" onClick={() => run(() => transitionTask(t.id, "completed"), "Approved").catch(() => undefined)}>
                                      <ThumbsUp aria-hidden /> Approve
                                    </Button>
                                    <Tooltip label="Send it back to them">
                                      <Button size="sm" variant="ghost" onClick={() => run(() => transitionTask(t.id, "in_progress"), "Sent back").catch(() => undefined)}>
                                        <ThumbsDown aria-hidden /> Send back
                                      </Button>
                                    </Tooltip>
                                  </>
                                ) : null}
                                <Tooltip label="Edit task">
                                  <Button variant="ghost" size="icon" aria-label={`Edit ${t.title}`} onClick={() => setTaskSheet({ open: true, task: t })}>
                                    <Pencil aria-hidden />
                                  </Button>
                                </Tooltip>
                                <Tooltip label="Delete task">
                                  <Button variant="ghost" size="icon" aria-label={`Delete ${t.title}`} onClick={() => setDeletingTask(t)}>
                                    <Trash2 aria-hidden />
                                  </Button>
                                </Tooltip>
                              </div>
                            </GlassCard>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="routines">
          <p className="mb-4 text-sm text-muted">Work that repeats every working day. Each day gets its own copy on {person.name.split(" ")[0]}&apos;s Today page; editing a routine changes it from today on.</p>
          {templates.error ? (
            <ErrorState onRetry={templates.retry} />
          ) : templates.loading ? (
            <Skeleton aria-busy aria-label="Loading routines" className="h-24 rounded-card" />
          ) : sortedTemplates.length === 0 ? (
            <EmptyState icon={Repeat} title="No daily routines yet" description="A routine is work that repeats, like opening checks or end-of-day cash-up. It appears on their Today screen automatically every working day." action={<Button onClick={() => setTemplateSheet({ open: true })} disabled={off}><Plus aria-hidden /> Add daily routine</Button>} />
          ) : (
            <ul className="space-y-2">
              {sortedTemplates.map((t) => (
                <li key={t.id}>
                  <GlassCard className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 p-4", !t.active && "opacity-75")}>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate font-semibold">{t.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                        <PriorityBadge priority={t.priority} />
                        {(() => {
                          const copy = todaysCopy(t.id);
                          if (!copy) return null;
                          const state = copyState(copy);
                          return state === "done" ? <StatusBadge status="completed" /> : state === "missed" ? <span className="inline-flex h-6 items-center rounded-full bg-danger/12 px-2.5 text-xs font-semibold text-danger">Not done today</span> : <StatusBadge status={copy.status} />;
                        })()}
                        <span>{describeWorkDays(t.activeDays)}</span>
                        {t.dueTime ? <span className="num">· due {t.dueTime}</span> : null}
                        {t.subtasks.length > 0 ? <span className="num">· {t.subtasks.length} steps</span> : null}
                        {!t.active ? <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning"><Pause className="size-3.5" aria-hidden /> Paused</span> : null}
                      </div>
                    </div>
                    <div className="ml-auto flex">
                      <Tooltip label={t.active ? "Pause: stop creating it each day" : "Resume"}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t.active ? `Pause ${t.title}` : `Resume ${t.title}`}
                          onClick={() =>
                            run(
                              () => apiFetch("/api/admin/templates", "PATCH", { templateId: t.id, title: t.title, description: t.description, priority: t.priority, dueTime: t.dueTime ?? "", subtasks: t.subtasks, activeDays: t.activeDays, active: !t.active }),
                              t.active ? "Routine paused" : "Routine resumed",
                            ).catch(() => undefined)
                          }
                        >
                          {t.active ? <Pause aria-hidden /> : <Play aria-hidden />}
                        </Button>
                      </Tooltip>
                      <Tooltip label="Edit routine">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${t.title}`} onClick={() => setTemplateSheet({ open: true, template: t, todayTask: todaysCopy(t.id) })}>
                          <Pencil aria-hidden />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Delete routine">
                        <Button variant="ghost" size="icon" aria-label={`Delete ${t.title}`} onClick={() => setDeletingTemplate(t)}>
                          <Trash2 aria-hidden />
                        </Button>
                      </Tooltip>
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>
          )}

          {copies.length > 0 ? (
            <section aria-labelledby="recent-copies" className="mt-8">
              <h2 id="recent-copies" className="mb-1 font-display text-base font-semibold">
                Last 7 days
              </h2>
              <p className="mb-3 text-sm text-muted">How each day&apos;s copy of a routine went, newest first.</p>
              <GlassCard className="overflow-hidden">
                <ul className="divide-y divide-border-solid">
                  {copies.map((c) => {
                    const state = copyState(c);
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                        <span className="num w-28 shrink-0 text-sm text-muted">{dayLabel(c.date, today)}</span>
                        <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{c.title}</span>
                        {state === "done" ? <StatusBadge status="completed" /> : state === "missed" ? <span className="inline-flex h-6 items-center rounded-full bg-danger/12 px-2.5 text-xs font-semibold text-danger">Not done</span> : <StatusBadge status={c.status} />}
                        {state === "missed" ? <span className="w-full text-sm text-muted sm:w-auto sm:max-w-xs sm:truncate">{c.missedReason ? `Reason: ${c.missedReason}` : "No reason given yet"}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </GlassCard>
            </section>
          ) : null}
        </TabsContent>
        <TabsContent value="journal">
          <EmployeeJournalTab employee={person} business={business} />
        </TabsContent>
      </Tabs>

      <TaskSheet
        open={taskSheet.open}
        onOpenChange={(o) => setTaskSheet((s) => ({ ...s, open: o }))}
        task={taskSheet.task}
        employees={employees.data ?? []}
        businesses={businesses.data ?? []}
        defaultAssigneeId={employeeId}
      />
      <TemplateSheet open={templateSheet.open} onOpenChange={(o) => setTemplateSheet((s) => ({ ...s, open: o }))} employee={{ id: employeeId, name: person.name }} template={templateSheet.template} todayTask={templateSheet.todayTask} />
      <ConfirmDialog
        open={!!deletingTask}
        onOpenChange={(o) => !o && setDeletingTask(null)}
        title={`Delete “${deletingTask?.title ?? "task"}”?`}
        description="It disappears for them too. The change stays in the audit log."
        confirmLabel="Delete task"
        onConfirm={() => (deletingTask ? run(() => apiFetch("/api/admin/tasks/delete", "POST", { taskId: deletingTask.id }), "Task deleted") : undefined)}
      />
      <ConfirmDialog
        open={!!deletingTemplate}
        onOpenChange={(o) => !o && setDeletingTemplate(null)}
        title={`Delete the routine “${deletingTemplate?.title ?? ""}”?`}
        description="No new copies are created. Days already created keep their history."
        confirmLabel="Delete routine"
        onConfirm={() => (deletingTemplate ? run(() => apiFetch("/api/admin/templates/delete", "POST", { templateId: deletingTemplate.id }), "Routine deleted") : undefined)}
      />
    </>
  );
}
