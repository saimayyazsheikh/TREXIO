"use client";

import { useId, useState } from "react";
import { CheckCheck, ChevronDown, Plus, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeMySteps, type PersonalStepCall } from "@/lib/tasks-client";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

/**
 * Your own list for a task: things you want to remember to do for it. Only you change it; your admin can read it.
 * It never changes the admin's steps or whether the task counts as finished.
 */
export function PersonalSteps({ task, uid, locked }: { task: WithId<TaskDoc>; uid: string; locked: boolean }) {
  const steps = task.personalSteps?.[uid] ?? [];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const done = steps.filter((s) => s.done).length;
  const allDone = steps.length > 0 && done === steps.length;
  if (locked && steps.length === 0) return null;

  async function run(call: PersonalStepCall) {
    setBusy(true);
    try {
      await changeMySteps(task.id, call);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const title = text.trim();
    if (!title || busy) return;
    setText("");
    await run({ op: "add", title });
  }

  // Nothing written yet: just a quiet link, so a plain task card stays uncluttered.
  if (steps.length === 0 && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-control text-sm text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Plus className="size-4" aria-hidden /> My own steps
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border-solid">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {steps.length === 0 ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Plus className="size-4" aria-hidden /> My own steps
          </span>
        ) : (
          <span className="num shrink-0">
            My steps <span className="text-muted">{done}/{steps.length}</span>
          </span>
        )}
        <span className="flex-1" />
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={listId} className="border-t border-dashed border-border-solid">
          <p className="px-3 pt-2 text-xs text-muted">Only for you to remember things. Your admin can see this list, but it doesn&apos;t change the task&apos;s own steps.</p>
          {steps.length > 1 && !locked ? (
            <div className="flex justify-end px-2 pt-1">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run({ op: "all", done: !allDone })}>
                {allDone ? <Undo2 aria-hidden /> : <CheckCheck aria-hidden />} {allDone ? "Untick all" : "Tick all"}
              </Button>
            </div>
          ) : null}
          <ul className="divide-y divide-border-solid">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-1 pr-1">
                <label className={cn("flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 px-3 py-2.5", locked && "cursor-not-allowed opacity-70")}>
                  <input
                    type="checkbox"
                    className="mt-px size-[18px] shrink-0 accent-[var(--brand)]"
                    checked={s.done}
                    disabled={locked || busy}
                    onChange={(e) => void run({ op: "toggle", stepId: s.id, done: e.target.checked })}
                  />
                  <span className={cn("min-w-0 flex-1 text-sm leading-snug", s.done && "text-muted line-through")}>{s.title}</span>
                </label>
                {!locked ? (
                  <Button variant="ghost" size="icon" aria-label={`Remove “${s.title}”`} disabled={busy} onClick={() => void run({ op: "remove", stepId: s.id })}>
                    <X aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {!locked ? (
            <form
              className="flex gap-2 border-t border-dashed border-border-solid p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <Input aria-label="Add a step for yourself" placeholder="Add a step for yourself" maxLength={120} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={busy || text.trim().length === 0}>
                Add
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
