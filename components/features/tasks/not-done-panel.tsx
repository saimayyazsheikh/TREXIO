"use client";

import { useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/features/glass-card";
import { PriorityBadge, pill } from "@/components/features/badges";
import { explainMissed } from "@/lib/tasks-client";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

function Item({ task, idp }: { task: WithId<TaskDoc>; idp: string }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const due = task.dueAt?.toDate() ?? null;
  const when = due ? formatPkt(due, "EEE d MMM, h:mm a") : formatPkt(new Date(`${task.date}T12:00:00+05:00`), "EEE d MMM");
  const given = !!task.missedReason && !editing;

  async function save() {
    setBusy(true);
    try {
      await explainMissed(task.id, text);
      toast.success("Thanks. Your admin can see why.");
      setEditing(false);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <GlassCard className={cn("p-4", given ? "" : "border-danger/40")}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="min-w-0 flex-1 basis-40 font-semibold leading-snug">{task.title}</h3>
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="num mt-1 text-xs text-muted">Was due {when}</p>

        {given ? (
          <div className="mt-3">
            <p className="border-l-2 border-border-solid pl-3 text-sm">{task.missedReason}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
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
              <TriangleAlert className="size-3.5" aria-hidden /> Why wasn&apos;t it done?
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
            <div className="mt-2 flex justify-end gap-2">
              {editing ? (
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setText(""); }}>
                  Cancel
                </Button>
              ) : null}
              <Button size="sm" loading={busy} disabled={text.trim().length < 3} onClick={save}>
                Save reason
              </Button>
            </div>
          </div>
        )}
      </GlassCard>
    </li>
  );
}

/** Daily routines whose time has passed. Each needs a reason, so the admin knows why. Only what is still ahead stays on the main list. */
export function NotDonePanel({ items, idp }: { items: WithId<TaskDoc>[]; idp: string }) {
  const waiting = items.filter((t) => !t.missedReason).length;
  return (
    <section aria-labelledby={`${idp}-not-done-heading`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={`${idp}-not-done-heading`} className="font-display text-lg font-semibold">
          Not done
        </h2>
        {waiting > 0 ? <span className={cn(pill, "bg-danger/12 text-danger")}>{waiting} need a reason</span> : null}
      </div>
      {items.length === 0 ? (
        <GlassCard className="p-5 text-center">
          <CircleCheck className="mx-auto mb-2 size-6 text-success" aria-hidden />
          <p className="font-medium">Nothing missed</p>
          <p className="mt-0.5 text-sm text-muted">Routines you don&apos;t finish in time will land here, so you can tell your admin why.</p>
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <Item key={t.id} task={t} idp={idp} />
          ))}
        </ul>
      )}
    </section>
  );
}
