"use client";

import { useMemo, useState } from "react";
import { Columns3, ListPlus, Search, SearchX } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { PageHeader } from "@/components/features/page-header";
import { KanbanBoard, type BoardRow } from "@/components/features/kanban/kanban-board";
import type { Person } from "@/components/features/kanban/kanban-card";
import { BlockDialog } from "@/components/features/tasks/block-dialog";
import { TaskDrawer } from "@/components/features/tasks/task-drawer";
import { TaskSheet } from "@/components/features/tasks/task-sheet";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { useTaskActions } from "@/hooks/use-task-actions";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { businessColorVar } from "@/lib/domain/business-colors";
import { DATE_PRESETS, NO_FILTERS, filterTasks, groupLanes, rangeFor, type BoardFilters, type DatePreset, type GroupBy } from "@/lib/domain/board";
import { PRIORITIES, PRIORITY_LABEL, type Role, type TaskStatus } from "@/lib/domain/constants";
import { availableMoves } from "@/lib/domain/task-moves";
import { pktDateString } from "@/lib/time";
import type { BusinessDoc, TaskDoc, UserDoc, WithId } from "@/types/models";

/** Kanban for one viewer: the admin sees every business, an employee sees only their own tasks. */
export function BoardView({ viewer }: { viewer: { uid: string; role: Role } }) {
  const isAdmin = viewer.role === "admin";
  const now = useNow();
  const today = pktDateString(now);
  const { db } = getFirebase();

  const [preset, setPreset] = useState<DatePreset>("today");
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const { start, end } = rangeFor(preset, today);

  const tasksCol = useMemo(() => orgCollection(db, "tasks"), [db]);
  const rangeQ = useMemo(
    () =>
      isAdmin
        ? query(tasksCol, where("date", ">=", start), where("date", "<=", end), orderBy("date", "desc"), limit(600))
        : query(tasksCol, where("assigneeIds", "array-contains", viewer.uid), where("date", ">=", start), where("date", "<=", end), orderBy("date", "desc"), limit(300)),
    [tasksCol, isAdmin, viewer.uid, start, end],
  );
  const carryQ = useMemo(
    () =>
      isAdmin
        ? query(tasksCol, where("kind", "==", "oneoff"), where("date", "<", start), orderBy("date", "desc"), limit(200))
        : query(tasksCol, where("assigneeIds", "array-contains", viewer.uid), where("kind", "==", "oneoff"), where("date", "<", start), orderBy("date", "desc"), limit(100)),
    [tasksCol, isAdmin, viewer.uid, start],
  );
  const usersQ = useMemo(() => (isAdmin ? query(orgCollection(db, "users"), where("role", "==", "employee")) : null), [db, isAdmin]);
  const businessesQ = useMemo(() => (isAdmin ? query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")) : null), [db, isAdmin]);

  const inRange = useCollection<TaskDoc>(rangeQ);
  const carried = useCollection<TaskDoc>(carryQ);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  // Everything in the period, plus unfinished one-off tasks from before it (same rule as Today).
  const tasks = useMemo(() => {
    const byId = new Map<string, WithId<TaskDoc>>();
    for (const t of carried.data ?? []) if (t.status !== "completed") byId.set(t.id, t);
    for (const t of inRange.data ?? []) byId.set(t.id, t);
    return [...byId.values()];
  }, [inRange.data, carried.data]);

  const { displayStatus, move, tickSubtask, savingSubtasks } = useTaskActions(viewer, tasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<WithId<TaskDoc> | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; task?: WithId<TaskDoc> }>({ open: false });

  const businessById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);
  const people = useMemo(() => new Map<string, Person>((users.data ?? []).map((u) => [u.id, { name: u.name }])), [users.data]);

  const rows: BoardRow[] = useMemo(
    () => tasks.map((t) => ({ id: t.id, status: displayStatus(t), priority: t.priority, title: t.title, businessId: t.businessId, assigneeIds: t.assigneeIds, assigneeNames: t.assigneeNames, dueAtMs: t.dueAt?.toMillis() ?? null, task: t })),
    [tasks, displayStatus],
  );
  const filtered = useMemo(() => filterTasks(rows, filters), [rows, filters]);
  const lanes = useMemo(() => groupLanes(filtered, groupBy, { business: (id) => businessById.get(id)?.name ?? "Business" }), [filtered, groupBy, businessById]);

  const selected = selectedId ? (tasks.find((t) => t.id === selectedId) ?? null) : null;

  function requestMove(task: WithId<TaskDoc>, status: TaskStatus, opts?: { kind?: "untick" }) {
    const option = availableMoves({ ...task, status: displayStatus(task) }, viewer).find((m) => m.status === status && m.kind === opts?.kind);
    // Blocking needs a reason first; every other move (and every refusal, which explains itself) goes straight through.
    if (status === "blocked" && option?.enabled) return setBlocking(task);
    void move({ ...task, status: displayStatus(task) }, status, opts);
  }

  const error = inRange.error ?? carried.error ?? users.error ?? businesses.error;
  const loading = inRange.loading || carried.loading || users.loading || businesses.loading;
  const set = (patch: Partial<BoardFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const assignButton = isAdmin ? (
    <Button onClick={() => setSheet({ open: true })}>
      <ListPlus aria-hidden /> Assign task
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader
        title={isAdmin ? "Kanban" : "My board"}
        subtitle={isAdmin ? "Every task across your businesses. Drag a card to change its status." : "Your tasks by status. Drag a card, or use its “…” menu."}
        actions={assignButton}
      />

      <div className="glass mb-4 grid gap-3 rounded-card p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search tasks" placeholder={isAdmin ? "Search tasks or people" : "Search your tasks"} className="pl-9" value={filters.search} onChange={(e) => set({ search: e.target.value })} />
        </div>
        <Select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)}>
          {DATE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Priority" value={filters.priority} onChange={(e) => set({ priority: e.target.value as BoardFilters["priority"] })}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        {isAdmin ? (
          <>
            <Select aria-label="Business" value={filters.businessId} onChange={(e) => set({ businessId: e.target.value, employeeId: "" })}>
              <option value="">All businesses</option>
              {(businesses.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Person" value={filters.employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
              <option value="">Everyone</option>
              {(users.data ?? [])
                .filter((u) => !filters.businessId || u.businessId === filters.businessId)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
            <Select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="lg:col-start-6">
              <option value="none">No grouping</option>
              <option value="employee">Group by person</option>
              <option value="business">Group by business</option>
            </Select>
          </>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted">
        {loading || error ? " " : `${filtered.length} task${filtered.length === 1 ? "" : "s"} · includes unfinished one-off tasks from earlier days`}
      </p>

      {error ? (
        <ErrorState
          onRetry={() => {
            inRange.retry();
            carried.retry();
            users.retry();
            businesses.retry();
          }}
        />
      ) : loading ? (
        <div aria-busy aria-label="Loading board" className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-72 shrink-0 rounded-card sm:w-auto sm:flex-1" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No tasks in this period"
          description={isAdmin ? "Assign a task, or add a daily routine to a team member, and it shows up here as a card you can drag between columns." : "When your admin gives you work, or your daily routine starts, it appears here as a card."}
          action={assignButton}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No tasks match those filters"
          description="Try a wider period or clear the filters."
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <KanbanBoard
          lanes={lanes}
          viewer={viewer}
          people={people}
          now={now}
          today={today}
          accentFor={(id) => (businessById.has(id) ? businessColorVar(businessById.get(id)!.color) : undefined)}
          businessNameFor={(id) => businessById.get(id)?.name}
          onOpen={(t) => setSelectedId(t.id)}
          onMove={requestMove}
        />
      )}

      <TaskDrawer
        task={selected}
        status={selected ? displayStatus(selected) : "todo"}
        viewer={viewer}
        business={selected ? businessById.get(selected.businessId) : undefined}
        now={now}
        today={today}
        savingSubtasks={savingSubtasks}
        onClose={() => setSelectedId(null)}
        onMove={requestMove}
        onBlock={setBlocking}
        onToggleSubtask={tickSubtask}
        onEdit={
          isAdmin
            ? (t) => {
                setSelectedId(null);
                setSheet({ open: true, task: t });
              }
            : undefined
        }
      />
      <BlockDialog
        title={blocking?.title ?? null}
        onOpenChange={(o) => !o && setBlocking(null)}
        onConfirm={(reason) => (blocking ? move({ ...blocking, status: displayStatus(blocking) }, "blocked", { reason }) : Promise.resolve(false))}
      />
      {isAdmin ? <TaskSheet open={sheet.open} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} task={sheet.task} employees={users.data ?? []} businesses={businesses.data ?? []} /> : null}
    </>
  );
}
