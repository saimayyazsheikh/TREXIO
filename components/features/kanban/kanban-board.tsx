"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { ChevronDown } from "lucide-react";
import { KanbanCard, KanbanCardBody, type Person } from "@/components/features/kanban/kanban-card";
import { KanbanColumn } from "@/components/features/kanban/kanban-column";
import { BOARD_STATUSES, columnTasks, type Lane } from "@/lib/domain/board";
import { TASK_STATUS_LABEL, type Role, type TaskStatus } from "@/lib/domain/constants";
import { availableMoves } from "@/lib/domain/task-moves";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

export type BoardRow = BoardRowBase & { task: WithId<TaskDoc> };
type BoardRowBase = { id: string; status: TaskStatus; priority: TaskDoc["priority"]; title: string; businessId: string; assigneeIds: string[]; assigneeNames: Record<string, string>; dueAtMs: number | null };

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

const parse = (id: unknown) => String(id).split("::") as [string, string];

/**
 * Keyboard moves jump column to column (the default would nudge by 25px). Left/Right step through the columns of
 * the lane; Up/Down jump to the same status in the neighbouring swimlane.
 */
const columnJump: KeyboardCoordinateGetter = (event, { context: { active, droppableRects, droppableContainers, collisionRect } }) => {
  const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.code as "ArrowRight"];
  if (!dir || !active || !collisionRect) return undefined;
  event.preventDefault();

  const cols = droppableContainers
    .getEnabled()
    .map((c) => ({ id: String(c.id), rect: droppableRects.get(c.id), status: (c.data.current as { status?: string } | undefined)?.status }))
    .filter((c): c is { id: string; rect: NonNullable<typeof c.rect>; status: string | undefined } => !!c.rect);

  // The column the card currently hovers over, found from the centre of the dragged card.
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  const here = cols.find((c) => cx >= c.rect.left && cx <= c.rect.right && cy >= c.rect.top && cy <= c.rect.bottom);
  if (!here) return undefined;

  // Left/Right: neighbours in the same lane, ordered by position. Up/Down: same status across lanes.
  const sequence =
    dir[0] !== 0
      ? cols.filter((c) => parse(c.id)[0] === parse(here.id)[0]).sort((a, b) => a.rect.left - b.rect.left)
      : cols.filter((c) => c.status === here.status).sort((a, b) => a.rect.top - b.rect.top);
  const target = sequence[sequence.findIndex((c) => c.id === here.id) + (dir[0] || dir[1])];

  return target ? { x: target.rect.left + 8, y: target.rect.top + 8 } : undefined;
};

type Props = {
  lanes: Lane<BoardRow>[];
  viewer: { uid: string; role: Role };
  people: ReadonlyMap<string, Person>;
  now: Date;
  today: string;
  accentFor: (businessId: string) => string | undefined;
  onOpen: (task: WithId<TaskDoc>) => void;
  onMove: (task: WithId<TaskDoc>, status: TaskStatus, opts?: { kind?: "untick" }) => void;
};

export function KanbanBoard({ lanes, viewer, people, now, today, accentFor, onOpen, onMove }: Props) {
  const [active, setActive] = useState<{ task: WithId<TaskDoc>; status: TaskStatus; laneKey: string } | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to drag on touch so swiping still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] }, coordinateGetter: columnJump }),
  );

  const rowOf = (id: unknown) => lanes.flatMap((l) => l.tasks).find((r) => r.id === parse(id)[1]);
  const statusLabel = (id: unknown) => TASK_STATUS_LABEL[parse(id)[1] as TaskStatus] ?? "that column";

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up “${rowOf(a.id)?.title ?? "task"}”. Use the arrow keys to choose a column, then press Space to drop it.`,
    onDragOver: ({ active: a, over }) => (over ? `“${rowOf(a.id)?.title ?? "task"}” is over ${statusLabel(over.id)}.` : undefined),
    onDragEnd: ({ active: a, over }) => (over ? `Dropped “${rowOf(a.id)?.title ?? "task"}” in ${statusLabel(over.id)}.` : `“${rowOf(a.id)?.title ?? "task"}” was dropped outside a column and didn't move.`),
    onDragCancel: ({ active: a }) => `Cancelled. “${rowOf(a.id)?.title ?? "task"}” didn't move.`,
  };

  function handleStart(e: DragStartEvent) {
    const row = rowOf(e.active.id);
    if (row) setActive({ task: row.task, status: row.status, laneKey: parse(e.active.id)[0] });
  }

  function handleEnd(e: DragEndEvent) {
    const current = active;
    setActive(null);
    if (!current || !e.over) return;
    const target = parse(e.over.id)[1] as TaskStatus;
    if (target === current.status) return;
    onMove(current.task, target);
  }

  const droppableFor = (status: TaskStatus): boolean | undefined => {
    if (!active) return undefined;
    if (status === active.status) return true;
    return availableMoves({ ...active.task, status: active.status }, viewer).some((m) => m.status === status && m.kind !== "untick" && m.enabled);
  };

  const toggle = (key: string) => setCollapsed((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set(s).add(key)));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "To pick up a task, press Space. Use the arrow keys to move it between columns, Space to drop, Escape to cancel. Press Enter to open its details." } }}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="space-y-6">
        {lanes.map((lane) => {
          const isCollapsed = collapsed.has(lane.key);
          return (
            <div key={lane.key}>
              {lane.label ? (
                <button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(lane.key)} className="mb-2 flex min-h-11 items-center gap-2 rounded-control px-1 font-display text-base font-bold hover:bg-surface-raised">
                  <ChevronDown className={cn("size-4 transition-transform", isCollapsed && "-rotate-90")} aria-hidden />
                  {lane.label}
                  <span className="num rounded-full bg-surface-raised px-2 py-0.5 text-xs font-semibold text-muted">{lane.tasks.length}</span>
                </button>
              ) : null}
              {!isCollapsed ? (
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                  {BOARD_STATUSES.map((status) => {
                    const rows = columnTasks(lane.tasks, status);
                    return (
                      <KanbanColumn key={status} laneKey={lane.key} status={status} count={rows.length} droppable={droppableFor(status)} dragging={!!active}>
                        {rows.map((row) => (
                          <KanbanCard
                            key={row.id}
                            task={row.task}
                            status={row.status}
                            laneKey={lane.key}
                            viewer={viewer}
                            people={people}
                            now={now}
                            today={today}
                            accent={accentFor(row.businessId)}
                            onOpen={onOpen}
                            onMove={onMove}
                          />
                        ))}
                      </KanbanColumn>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="w-72 rotate-1">
            <KanbanCardBody task={active.task} status={active.status} viewer={viewer} people={people} now={now} today={today} accent={accentFor(active.task.businessId)} onMove={onMove} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
