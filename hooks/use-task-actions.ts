"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Role, TaskStatus } from "@/lib/domain/constants";
import { availableMoves } from "@/lib/domain/task-moves";
import { toggleSubtask, transitionTask } from "@/lib/tasks-client";
import type { TaskDoc, WithId } from "@/types/models";

type Viewer = { uid: string; role: Role };

/**
 * Task actions shared by Today and the boards: validated moves with optimistic status, friendly toasts, Undo.
 * `pending` holds the status a task is expected to reach; it clears when live data catches up.
 */
export function useTaskActions(viewer: Viewer, tasks: WithId<TaskDoc>[]) {
  const { uid, role } = viewer;
  const [pending, setPending] = useState<Record<string, TaskStatus>>({});
  const [savingSubtasks, setSavingSubtasks] = useState<ReadonlySet<string>>(new Set());

  const clearPending = useCallback((id: string) => setPending((p) => (id in p ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)) : p)), []);

  useEffect(() => {
    setPending((p) => {
      const next = Object.fromEntries(Object.entries(p).filter(([id, status]) => tasks.find((t) => t.id === id)?.status !== status));
      return Object.keys(next).length === Object.keys(p).length ? p : next;
    });
  }, [tasks]);

  const displayStatus = useCallback((t: WithId<TaskDoc>): TaskStatus => pending[t.id] ?? t.status, [pending]);

  const move = useCallback(
    async (task: WithId<TaskDoc>, requested: TaskStatus, opts: { reason?: string; kind?: "untick" } = {}): Promise<boolean> => {
      const option = availableMoves(task, { uid, role }).find((m) => m.status === requested && m.kind === opts.kind);
      if (!option) {
        toast.error("That move isn't available for this task.");
        return false;
      }
      if (!option.enabled) {
        toast.error(option.reason ?? "That move isn't available right now.");
        return false;
      }
      const moves = option.outcome !== task.status;
      if (moves) setPending((p) => ({ ...p, [task.id]: option.outcome }));
      try {
        await transitionTask(task.id, requested, opts.reason);
        if (moves) setTimeout(() => clearPending(task.id), 4000);
      } catch (error) {
        if (moves) clearPending(task.id);
        toast.error(error instanceof Error ? error.message : "Couldn't update that task.");
        return false;
      }

      const shared = task.assigneeIds.length > 1;
      if (opts.kind === "untick") toast.success("Your part is back on your list.");
      else if (requested === "completed" && option.outcome === "completed") {
        toast.success(`Done: ${task.title}`, {
          action: role === "employee" ? { label: "Undo", onClick: () => void move({ ...task, status: "completed" }, shared ? "in_progress" : "todo") } : undefined,
        });
      } else if (requested === "completed" && option.outcome === "under_review") toast.success("Sent for review. Your admin will take a look.");
      else if (requested === "completed") {
        toast.success("You've finished your part. Waiting for the others.", {
          action: { label: "Undo", onClick: () => void move({ ...task, status: "in_progress", completion: { ...task.completion, [uid]: { done: true } } }, "in_progress", { kind: "untick" }) },
        });
      } else if (requested === "blocked") toast.success("Marked as blocked.");
      return true;
    },
    [uid, role, clearPending],
  );

  const tickSubtask = useCallback(async (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => {
    setSavingSubtasks((s) => new Set(s).add(subtaskId));
    try {
      await toggleSubtask(task.id, subtaskId, done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that step.");
    } finally {
      setSavingSubtasks((s) => new Set([...s].filter((x) => x !== subtaskId)));
    }
  }, []);

  return { displayStatus, move, tickSubtask, savingSubtasks };
}
