"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/time-field";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChecklistEditor, type ChecklistItem } from "@/components/features/tasks/checklist-editor";
import { DayPicker } from "@/components/features/tasks/day-picker";
import { PrioritySelect } from "@/components/features/tasks/priority-select";
import { apiFetch } from "@/lib/api-client";
import { createTemplateSchema, formChecklistSchema } from "@/lib/domain/task-schemas";
import type { Priority } from "@/lib/domain/constants";
import type { TemplateDoc, WithId } from "@/types/models";

type FormValues = {
  title: string;
  description: string;
  priority: Priority;
  dueTime: string;
  subtasks: ChecklistItem[];
  activeDays: number[];
  active: boolean;
};

const formSchema = createTemplateSchema.omit({ employeeId: true, subtasks: true }).extend({ subtasks: formChecklistSchema });
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

export function TemplateSheet({
  open,
  onOpenChange,
  employee,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; name: string };
  /** Present when editing; absent when creating. */
  template?: WithId<TemplateDoc>;
}) {
  const editing = !!template;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) as unknown as Resolver<FormValues> });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset(
      template
        ? {
            title: template.title,
            description: template.description,
            priority: template.priority,
            dueTime: template.dueTime ?? "",
            subtasks: template.subtasks,
            activeDays: template.activeDays,
            active: template.active,
          }
        : { title: "", description: "", priority: "medium", dueTime: "", subtasks: [], activeDays: [1, 2, 3, 4, 5, 6], active: true },
    );
  }, [open, template, reset]);

  async function onSubmit(values: z.output<typeof formSchema>) {
    setFormError(null);
    try {
      const body = {
        title: values.title, description: values.description, priority: values.priority, dueTime: values.dueTime ?? "",
        subtasks: values.subtasks.map((s) => ({ ...(s.id ? { id: s.id } : {}), title: s.title })),
        activeDays: values.activeDays, active: values.active,
      };
      if (template) await apiFetch("/api/admin/templates", "PATCH", { ...body, templateId: template.id });
      else await apiFetch("/api/admin/templates", "POST", { ...body, employeeId: employee.id });
      toast.success(editing ? "Routine updated. Today's copy is refreshed if it hasn't been started." : `Routine added for ${employee.name}`);
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Edit daily routine" : `New daily routine for ${employee.name}`}
        description="It's created fresh every working day. Changes apply from today on and never rewrite past days."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="template-form" loading={isSubmitting}>
              {editing ? "Save changes" : "Add routine"}
            </Button>
          </>
        }
      >
        <form id="template-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <Field id="tpl-title" label="Title" required error={errors.title?.message}>
            {(aria) => <Input {...aria} autoComplete="off" {...register("title")} />}
          </Field>

          <Field id="tpl-description" label="Details" hint="Instructions that show on every day's task." error={errors.description?.message}>
            {(aria) => (
              <textarea
                {...aria}
                rows={3}
                className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
                {...register("description")}
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span id="tpl-priority-label" className="text-sm font-medium">
              Priority
            </span>
            <Controller control={control} name="priority" render={({ field }) => <PrioritySelect value={field.value} onChange={field.onChange} labelledBy="tpl-priority-label" />} />
          </div>

          <Field id="tpl-due" label="Due time" hint="Optional. Shows as the deadline each day." error={errors.dueTime?.message}>
            {(aria) => <Controller control={control} name="dueTime" render={({ field }) => <TimeField {...aria} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />} />}
          </Field>

          <div>
            <Controller control={control} name="activeDays" render={({ field }) => <DayPicker legend="Runs on" value={field.value ?? EVERY_DAY} onChange={field.onChange} />} />
            <p className="mt-1.5 text-sm text-muted">It also skips days the business is closed.</p>
            {errors.activeDays ? <p className="mt-1.5 text-sm text-danger">{errors.activeDays.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Checklist</span>
            <Controller control={control} name="subtasks" render={({ field }) => <ChecklistEditor items={field.value ?? []} onChange={field.onChange} />} />
          </div>

          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--brand)]" {...register("active")} />
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-sm text-muted">Untick to pause it. Nothing new is created until you turn it back on.</span>
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
