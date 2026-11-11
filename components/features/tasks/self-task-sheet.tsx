"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TimeField } from "@/components/ui/time-field";
import { ChecklistEditor, type ChecklistItem } from "@/components/features/tasks/checklist-editor";
import { PrioritySelect } from "@/components/features/tasks/priority-select";
import type { Priority } from "@/lib/domain/constants";
import { addMyTask, deleteMyTask, editMyTask } from "@/lib/tasks-client";
import { pktDateString } from "@/lib/time";
import type { TaskDoc, WithId } from "@/types/models";

const timeOf = (task: WithId<TaskDoc>) => (task.dueAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(task.dueAt.toDate()) : "");

/** A task you add for yourself: something your admin told you out loud, or just something you don't want to forget. */
export function SelfTaskSheet({ open, onOpenChange, task, today }: { open: boolean; onOpenChange: (open: boolean) => void; task?: WithId<TaskDoc> | null; today: string }) {
  const editing = !!task;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [date, setDate] = useState(today);
  const [dueTime, setDueTime] = useState("");
  const [steps, setSteps] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPriority(task?.priority ?? "medium");
    setDate(task?.date ?? pktDateString());
    setDueTime(task ? timeOf(task) : "");
    setSteps(task ? task.subtasks.map((s) => ({ id: s.id, title: s.title })) : []);
  }, [open, task]);

  async function save() {
    setError(null);
    if (title.trim().length < 2) return setError("Give it a short title.");
    setBusy(true);
    try {
      const base = { title, description, priority, date, dueTime };
      if (task) await editMyTask(task.id, { ...base, subtasks: steps.filter((s) => s.title.trim()).map((s) => ({ ...(s.id ? { id: s.id } : {}), title: s.title })) });
      else await addMyTask({ ...base, subtasks: steps.map((s) => s.title).filter((t) => t.trim()) });
      toast.success(editing ? "Task updated" : date > today ? "Added. It will show up on its day." : "Added to your list");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    try {
      await deleteMyTask(task.id);
      toast.success("Task deleted");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Edit my task" : "Add a task for myself"}
        description="Only you and your admin can see it. Pick a later day and it will appear on that day."
        footer={
          <>
            {editing ? (
              confirmDelete ? (
                <Button variant="danger" className="mr-auto" loading={busy} onClick={remove}>
                  Yes, delete it
                </Button>
              ) : (
                <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={save}>
              {editing ? "Save changes" : "Add task"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field id="self-title" label="What do you need to do?" required>
            {(aria) => <Input {...aria} autoComplete="off" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>

          <Field id="self-description" label="Details" hint="Optional">
            {(aria) => (
              <textarea
                {...aria}
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span id="self-priority-label" className="text-sm font-medium">
              Priority
            </span>
            <PrioritySelect value={priority} onChange={setPriority} labelledBy="self-priority-label" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="self-date" label="Day" required>
              {(aria) => <Input {...aria} type="date" min={pktDateString()} value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field id="self-due" label="Due time" hint="Optional">
              {(aria) => <TimeField {...aria} value={dueTime} onChange={setDueTime} />}
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Steps</span>
            <ChecklistEditor items={steps} onChange={setSteps} />
          </div>

          {error ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
