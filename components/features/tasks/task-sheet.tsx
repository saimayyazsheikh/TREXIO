"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AssigneePicker } from "@/components/features/tasks/assignee-picker";
import { ChecklistEditor, type ChecklistItem } from "@/components/features/tasks/checklist-editor";
import { TaskLinkField } from "@/components/features/tasks/task-link-field";
import { PrioritySelect } from "@/components/features/tasks/priority-select";
import { apiFetch } from "@/lib/api-client";
import { MAX_DEPENDENCIES, MAX_RELATED } from "@/lib/domain/dependencies";
import { createTaskSchema, formChecklistSchema } from "@/lib/domain/task-schemas";
import type { Priority } from "@/lib/domain/constants";
import { pktDateString } from "@/lib/time";
import type { BusinessDoc, TaskDoc, UserDoc, WithId } from "@/types/models";

type FormValues = {
  title: string;
  description: string;
  priority: Priority;
  date: string;
  dueTime: string;
  assigneeIds: string[];
  completionMode: "all" | "any";
  dependsOnIds: string[];
  relatedTaskIds: string[];
  requiresReview: boolean;
  subtasks: ChecklistItem[];
};

const formSchema = createTaskSchema.omit({ subtasks: true }).extend({ subtasks: formChecklistSchema });
export function TaskSheet({
  open,
  onOpenChange,
  task,
  employees,
  businesses,
  defaultAssigneeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  task?: WithId<TaskDoc>;
  employees: WithId<UserDoc>[];
  businesses: WithId<BusinessDoc>[];
  defaultAssigneeId?: string;
}) {
  const editing = !!task;
  const [formError, setFormError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) as unknown as Resolver<FormValues> });
  const assigneeCount = watch("assigneeIds")?.length ?? 0;

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setTitles(task?.linkTitles ?? {});
    reset(
      task
        ? {
            title: task.title,
            description: task.description,
            priority: task.priority,
            date: task.date,
            dueTime: task.dueAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(task.dueAt.toDate()) : "",
            assigneeIds: task.assigneeIds,
            completionMode: task.completionMode,
            dependsOnIds: task.dependsOnIds,
            relatedTaskIds: task.relatedTaskIds,
            requiresReview: task.requiresReview,
            subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title })),
          }
        : {
            title: "", description: "", priority: "medium", date: pktDateString(), dueTime: "", assigneeIds: defaultAssigneeId ? [defaultAssigneeId] : [],
            completionMode: "all", dependsOnIds: [], relatedTaskIds: [], requiresReview: false, subtasks: [],
          },
    );
  }, [open, task, defaultAssigneeId, reset]);

  async function onSubmit(values: z.output<typeof formSchema>) {
    setFormError(null);
    const raw = getValues();
    const base = {
      title: raw.title, description: raw.description, priority: raw.priority, date: raw.date, dueTime: raw.dueTime,
      assigneeIds: raw.assigneeIds, completionMode: raw.completionMode, dependsOnIds: raw.dependsOnIds, relatedTaskIds: raw.relatedTaskIds,
      requiresReview: raw.requiresReview,
    };
    try {
      const subtasks = values.subtasks.map((s) => ({ ...(s.id ? { id: s.id } : {}), title: s.title }));
      if (task) await apiFetch("/api/admin/tasks", "PATCH", { ...base, taskId: task.id, subtasks });
      else await apiFetch("/api/admin/tasks", "POST", { ...base, subtasks: values.subtasks.map((s) => s.title) });

      toast.success(editing ? "Task updated" : "Task assigned");
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Edit task" : "Assign a task"}
        description={editing ? "Changes show up for them straight away." : "A one-off task for a single day. For repeating work, add a daily routine instead."}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="task-form" loading={isSubmitting}>
              {editing ? "Save changes" : "Assign task"}
            </Button>
          </>
        }
      >
        <form id="task-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <Field id="task-title" label="Title" required error={errors.title?.message}>
            {(aria) => <Input {...aria} autoComplete="off" {...register("title")} />}
          </Field>

          <Field id="task-description" label="Details" hint="Anything they need to know to get it done." error={errors.description?.message}>
            {(aria) => (
              <textarea
                {...aria}
                rows={3}
                className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
                {...register("description")}
              />
            )}
          </Field>

          <Controller
            control={control}
            name="assigneeIds"
            render={({ field }) => (
              <AssigneePicker
                // Remount when the sheet reopens on another task so the business starts in the right place.
                key={task?.id ?? "new"}
                value={field.value ?? []}
                onChange={field.onChange}
                employees={employees}
                businesses={businesses}
                error={errors.assigneeIds?.message}
              />
            )}
          />

          {assigneeCount > 1 ? (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">When is it finished?</legend>
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["all", "When everyone has finished their part", "Each person ticks their own part."],
                    ["any", "As soon as one person finishes", "The first to finish completes it for everyone."],
                  ] as const
                ).map(([value, title, help]) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-1 py-1.5 hover:bg-surface-raised">
                    <input type="radio" value={value} className="mt-1 size-5 accent-[var(--brand-from)]" {...register("completionMode")} />
                    <span>
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="block text-sm text-muted">{help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span id="task-priority-label" className="text-sm font-medium">
              Priority
            </span>
            <Controller control={control} name="priority" render={({ field }) => <PrioritySelect value={field.value} onChange={field.onChange} labelledBy="task-priority-label" />} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="task-date" label="Day" required error={errors.date?.message}>
              {(aria) => <Input {...aria} type="date" {...register("date")} />}
            </Field>
            <Field id="task-due" label="Due time" hint="Optional" error={errors.dueTime?.message}>
              {(aria) => <Input {...aria} type="time" {...register("dueTime")} />}
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Checklist</span>
            <Controller control={control} name="subtasks" render={({ field }) => <ChecklistEditor items={field.value ?? []} onChange={field.onChange} />} />
            {errors.subtasks ? <p className="text-sm text-danger">{errors.subtasks.message}</p> : null}
          </div>

          <Controller
            control={control}
            name="dependsOnIds"
            render={({ field }) => (
              <TaskLinkField
                label="Must be finished first"
                hint="They can't start or finish this task until these are completed. They'll see what they're waiting on."
                value={field.value ?? []}
                onChange={field.onChange}
                titles={titles}
                onTitle={(id, title) => setTitles((t) => ({ ...t, [id]: title }))}
                excludeId={task?.id}
                max={MAX_DEPENDENCIES}
              />
            )}
          />

          <Controller
            control={control}
            name="relatedTaskIds"
            render={({ field }) => (
              <TaskLinkField
                label="Related tasks"
                hint="Just a link for context. It doesn't block anything, and it shows on both tasks."
                value={field.value ?? []}
                onChange={field.onChange}
                titles={titles}
                onTitle={(id, title) => setTitles((t) => ({ ...t, [id]: title }))}
                excludeId={task?.id}
                max={MAX_RELATED}
              />
            )}
          />

          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--brand-from)]" {...register("requiresReview")} />
            <span>
              <span className="block text-sm font-medium">Needs my review</span>
              <span className="block text-sm text-muted">When they finish it, it waits for you to approve it instead of closing.</span>
            </span>
          </label>

          {formError ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
