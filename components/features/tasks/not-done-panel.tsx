"use client";

import { useState } from "react";
import { Check, CircleCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/features/glass-card";
import { PriorityBadge, pill } from "@/components/features/badges";
import { ChecklistBox } from "@/components/features/tasks/checklist-box";
import { explainMissed } from "@/lib/tasks-client";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

export type NotDoneActions = {
  savingSubtasks: ReadonlySet<string>;
  onToggleSubtask: (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => void;
  onTickAll: (task: WithId<TaskDoc>, done: boolean) => void;
  /** Finishes the routine now. `reason` is sent only when a new one was typed. Resolves to whether it worked. */
  onDone: (task: WithId<TaskDoc>, reason?: string) => Promise<boolean>;
};

function Item({ task, idp, actions }: { task: WithId<TaskDoc>; idp: string; actions: NotDoneActions }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"reason" | "done" | null>(null);
  const due = task.dueAt?.toDate() ?? null;
  const when = due ? formatPkt(due, "EEE d MMM, h:mm a") : formatPkt(new Date(`${task.date}T12:00:00+05:00`), "EEE d MMM");
  const given = !!task.missedReason && !editing;
  const typed = text.trim();
  const stepsLeft = task.subtaskTotal - task.subtaskDone;

  async function save() {
    setBusy("reason");
    try {
      await explainMissed(task.id, text);
      toast.success("Thanks. Your admin can see why.");
      setEditing(false);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    setBusy("done");
    // A reason typed in the box travels with the finish; an earlier one is already on the task.
    await actions.onDone(task, typed.length >= 3 ? typed : undefined);
    setBusy(null);
  }

  const doneBlocked = stepsLeft > 0 ? `Tick the ${stepsLeft} remaining ${stepsLeft === 1 ? "step" : "steps"} first` : !given && typed.length < 3 ? "Write why it was late first" : null;

  return (
    <li>
      <GlassCard className={cn("p-4", given ? "" : "border-danger/40")}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="min-w-0 flex-1 basis-40 font-semibold leading-snug">{task.title}</h3>
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="num mt-1 text-xs text-muted">Was due {when}</p>

        {task.subtaskTotal > 0 ? <ChecklistBox task={task} locked={false} savingSubtasks={actions.savingSubtasks} onToggleSubtask={actions.onToggleSubtask} onTickAll={actions.onTickAll} defaultOpen /> : null}

        {given ? (
          <div className="mt-3">
            <p className="border-l-2 border-border-solid pl-3 text-sm">{task.missedReason}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className={cn(pill, "bg-success/12 text-success")}>
                <CircleCheck className="size-3.5" aria-hidden /> Reason given
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setText(task.missedReason ?? ""); setEditing(true); }}>
                Change
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <label htmlFor={`${idp}-why-${task.id}`} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-danger">
              <TriangleAlert className="size-3.5" aria-hidden /> {editing ? "Change your reason" : "Why wasn't it done on time?"}
            </label>
            <textarea
              id={`${idp}-why-${task.id}`}
              rows={2}
              maxLength={300}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="A few words is enough"
              className="w-full rounded-control border border-input bg-surface-solid px-3 py-2 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
            {editing ? (
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setText(""); }}>
                  Cancel
                </Button>
                <Button variant="secondary" size="sm" loading={busy === "reason"} disabled={typed.length < 3} onClick={save}>
                  Save reason
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Two clear ways out: tell your admin why, or finish it now (the admin then sees it was done late, and why). */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border-solid pt-3">
          {doneBlocked ? <span className="mr-auto text-xs text-muted">{doneBlocked}</span> : null}
          {!given && !editing ? (
            <Button variant="secondary" size="sm" loading={busy === "reason"} disabled={typed.length < 3} onClick={save}>
              Save reason
            </Button>
          ) : null}
          <Button size="sm" loading={busy === "done"} aria-disabled={!!doneBlocked} className={cn(doneBlocked && "opacity-60")} onClick={() => (doneBlocked ? toast.info(doneBlocked) : void finish())}>
            <Check aria-hidden /> I&apos;ve done it now
          </Button>
        </div>
      </GlassCard>
    </li>
  );
}

/**
 * Daily routines whose time has passed. Each one gets a reason for the admin, and can still be finished later: the admin then
 * sees it was done late and why. Ones that already have a reason sit below the ones still waiting for it.
 */
export function NotDonePanel({ items, idp, actions }: { items: WithId<TaskDoc>[]; idp: string; actions: NotDoneActions }) {
  const waiting = items.filter((t) => !t.missedReason);
  const explained = items.filter((t) => !!t.missedReason);
  return (
    <section aria-labelledby={`${idp}-not-done-heading`} className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${idp}-not-done-heading`} className="font-display text-lg font-semibold">
            Not done
          </h2>
          {waiting.length > 0 ? <span className={cn(pill, "bg-danger/12 text-danger")}>{waiting.length} need a reason</span> : null}
        </div>
        <p className="mt-0.5 text-sm text-muted">Routines whose time has passed. Tell your admin why, and finish them now if you can.</p>
      </div>

      {items.length === 0 ? (
        <GlassCard className="p-5 text-center">
          <CircleCheck className="mx-auto mb-2 size-6 text-success" aria-hidden />
          <p className="font-medium">Nothing missed</p>
          <p className="mt-0.5 text-sm text-muted">Routines you don&apos;t finish in time will land here.</p>
        </GlassCard>
      ) : null}

      {waiting.length > 0 ? (
        <ul className="space-y-3" aria-label="Waiting for a reason">
          {waiting.map((t) => (
            <Item key={t.id} task={t} idp={idp} actions={actions} />
          ))}
        </ul>
      ) : null}

      {explained.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">Reason given, still not finished ({explained.length})</h3>
          <ul className="space-y-3" aria-label="Reason given">
            {explained.map((t) => (
              <Item key={t.id} task={t} idp={idp} actions={actions} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
