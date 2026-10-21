"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { CircleCheck, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { GlassCard } from "@/components/features/glass-card";
import { MAX_SLOT_TEXT, addTaskToSlot, hourKey, removeTaskFromSlot, slotFilled, slotLabel, type Slot, type Slots } from "@/lib/domain/journal";
import { pktHour } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

type SlotProps = {
  slotKey: string;
  slot: Slot | undefined;
  editable: boolean;
  isNow: boolean;
  tasks: WithId<TaskDoc>[];
  taskById: ReadonlyMap<string, WithId<TaskDoc>>;
  onChange: (key: string, slot: Slot, opts?: { immediate?: boolean }) => void;
  onFlush: () => void;
};

function SlotCard({ slotKey, slot, editable, isNow, tasks, taskById, onChange, onFlush }: SlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotKey}`, disabled: !editable });
  const label = slotLabel(slotKey);
  const filled = slotFilled(slot);
  const [text, setText] = useState(slot?.text ?? "");
  const [editing, setEditing] = useState(false);

  // Follow the saved text unless you're in the middle of typing.
  useEffect(() => {
    if (!editing) setText(slot?.text ?? "");
  }, [slot?.text, editing]);

  const chosen = slot?.taskIds ?? [];
  const available = tasks.filter((t) => !chosen.includes(t.id));

  return (
    <li>
      <GlassCard
        className={cn("p-3.5 transition-shadow", isNow && "ring-2 ring-ring", isOver && "ring-2 ring-success", !editable && !filled && "opacity-70")}
      >
        <div ref={setNodeRef}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold">{label}</h3>
            {isNow ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-0.5 text-xs font-semibold text-white">
                <Clock className="size-3.5" aria-hidden /> Now
              </span>
            ) : null}
            {filled ? (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-success">
                <CircleCheck className="size-4" aria-hidden /> Logged
              </span>
            ) : (
              <span className="ml-auto text-xs text-muted">{editable ? "Nothing yet" : "Nothing written"}</span>
            )}
          </div>

          {editable ? (
            <textarea
              aria-label={`What did you do from ${label}?`}
              rows={2}
              maxLength={MAX_SLOT_TEXT}
              value={text}
              placeholder="What did you work on this hour?"
              onFocus={() => setEditing(true)}
              onChange={(e) => {
                setText(e.target.value);
                onChange(slotKey, { text: e.target.value, taskIds: chosen });
              }}
              onBlur={() => {
                setEditing(false);
                onFlush();
              }}
              className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
          ) : slot?.text ? (
            <p className="whitespace-pre-line text-sm">{slot.text}</p>
          ) : null}

          {chosen.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tasks worked on">
              {chosen.map((id) => {
                const t = taskById.get(id);
                return (
                  <li key={id} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-solid bg-surface-raised pl-3 pr-1 text-sm">
                    {t?.status === "completed" ? <CircleCheck className="size-3.5 text-success" aria-label="completed" /> : null}
                    <span className="max-w-52 truncate">{t?.title ?? "Task no longer available"}</span>
                    {editable ? (
                      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove ${t?.title ?? "task"} from ${label}`} onClick={() => slot && onChange(slotKey, removeTaskFromSlot(slot, id), { immediate: true })}>
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    ) : (
                      <span className="w-2" />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {editable ? (
            <div className="mt-2 max-w-64">
              <Select
                aria-label={`Add a task to ${label}`}
                value=""
                disabled={available.length === 0}
                onChange={(e) => e.target.value && onChange(slotKey, addTaskToSlot(slot, e.target.value), { immediate: true })}
              >
                <option value="">{available.length === 0 ? (tasks.length === 0 ? "No tasks for this day" : "All tasks added") : "Add a task…"}</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </GlassCard>
    </li>
  );
}

/** The hourly timeline for one day. Editable on today for the owner; read-only everywhere else (including for the admin). */
export function JournalTimeline({
  date,
  today,
  now,
  expected,
  slots,
  editable,
  tasks,
  onChange,
  onFlush,
}: {
  date: string;
  today: string;
  now: Date;
  expected: string[];
  slots: Slots;
  editable: boolean;
  tasks: WithId<TaskDoc>[];
  onChange: (key: string, slot: Slot, opts?: { immediate?: boolean }) => void;
  onFlush: () => void;
}) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  // Hours outside the working window that already hold something stay visible.
  const extras = Object.keys(slots).filter((k) => !expected.includes(k) && slotFilled(slots[k]));
  const keys = [...new Set([...expected, ...extras])].sort();
  const nowKey = date === today ? hourKey(pktHour(now)) : null;

  return (
    <ol className="space-y-3" aria-label="Hourly timeline">
      {keys.map((k) => (
        <SlotCard key={k} slotKey={k} slot={slots[k]} editable={editable} isNow={k === nowKey} tasks={tasks} taskById={taskById} onChange={onChange} onFlush={onFlush} />
      ))}
    </ol>
  );
}
