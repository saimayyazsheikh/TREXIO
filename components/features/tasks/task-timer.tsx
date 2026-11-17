"use client";

import { useEffect, useState } from "react";
import { Play, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/domain/presence";
import { totalSpentSec } from "@/lib/domain/tasks";
import { timerTask } from "@/lib/tasks-client";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

/** Seconds on your running timer for this task, ticking every second, or null when it isn't running. */
export function useRunningSeconds(task: WithId<TaskDoc>, uid: string): number | null {
  const since = task.timers?.[uid]?.toMillis() ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since === null ? null : Math.max(0, Math.round((now - since) / 1000));
}

const clock = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/** A small live "timer running" pill for the closed task row. */
export function RunningBadge({ task, uid }: { task: WithId<TaskDoc>; uid: string }) {
  const running = useRunningSeconds(task, uid);
  if (running === null) return null;
  return (
    <span className="num inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-text" title="Your timer is running">
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand" /> {clock(running)}
    </span>
  );
}

/** Time on a task: start and stop your own timer, and see what has been spent against the estimate. */
export function TaskTimer({ task, uid, canTime }: { task: WithId<TaskDoc>; uid: string; canTime: boolean }) {
  const running = useRunningSeconds(task, uid);
  const [busy, setBusy] = useState(false);
  const mine = (task.timeSpent?.[uid] ?? 0) + (running ?? 0);
  const everyone = totalSpentSec({ timeSpent: task.timeSpent, timers: Object.fromEntries(Object.entries(task.timers ?? {}).map(([id, ts]) => [id, ts.toDate()])) }, new Date());
  const shared = task.assigneeIds.length > 1;
  const estimateSec = (task.estimateMin ?? 0) * 60;
  if (!canTime && everyone === 0 && !estimateSec) return null;

  async function act(action: "start" | "stop") {
    setBusy(true);
    try {
      await timerTask(task.id, action);
      if (action === "start") toast.success("Timer started. Any other timer of yours was stopped.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the timer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border-solid bg-surface-raised/40 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Timer className="size-4 text-muted" aria-hidden /> Time
      </span>
      <span className={cn("num text-sm", running !== null && "font-semibold text-brand-text")}>{running !== null ? clock(running) : formatDuration(mine)}</span>
      <span className="text-xs text-muted">
        {shared ? `All together ${formatDuration(everyone)}` : null}
        {estimateSec ? `${shared ? " · " : ""}Estimate ${formatDuration(estimateSec)}${everyone > estimateSec ? " (over)" : ""}` : null}
      </span>
      {canTime ? (
        <span className="ml-auto">
          {running !== null ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void act("stop")}>
              <Square aria-hidden /> Stop
            </Button>
          ) : (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void act("start")}>
              <Play aria-hidden /> Start timer
            </Button>
          )}
        </span>
      ) : null}
    </div>
  );
}
