"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { doc, getDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChecklistEditor, type ChecklistItem } from "@/components/features/tasks/checklist-editor";
import { PrioritySelect } from "@/components/features/tasks/priority-select";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { createTaskSchema, formChecklistSchema } from "@/lib/domain/task-schemas";
import type { Priority } from "@/lib/domain/constants";
import { pktDateString } from "@/lib/time";
import { formatBytes } from "@/lib/utils";
import type { BusinessDoc, TaskDoc, UserDoc, WithId } from "@/types/models";

const MAX_FILE = 10 * 1024 * 1024;
const MAX_FILES = 10;

type FormValues = {
  title: string;
  description: string;
  priority: Priority;
  date: string;
  dueTime: string;
  assigneeId: string;
  requiresReview: boolean;
  subtasks: ChecklistItem[];
};

const formSchema = createTaskSchema.omit({ subtasks: true }).extend({ subtasks: formChecklistSchema });
type Attachment = TaskDoc["attachments"][number];

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(-80);

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
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) as unknown as Resolver<FormValues> });

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setFileError(null);
    setFormError(null);
    setExisting(task?.attachments ?? []);
    reset(
      task
        ? {
            title: task.title,
            description: task.description,
            priority: task.priority,
            date: task.date,
            dueTime: task.dueAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(task.dueAt.toDate()) : "",
            assigneeId: task.assigneeIds[0] ?? "",
            requiresReview: task.requiresReview,
            subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title })),
          }
        : { title: "", description: "", priority: "medium", date: pktDateString(), dueTime: "", assigneeId: defaultAssigneeId ?? "", requiresReview: false, subtasks: [] },
    );
  }, [open, task, defaultAssigneeId, reset]);

  function addFiles(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    const tooBig = incoming.find((f) => f.size >= MAX_FILE);
    if (tooBig) return setFileError(`${tooBig.name} is over 10 MB.`);
    if (existing.length + files.length + incoming.length > MAX_FILES) return setFileError(`You can attach up to ${MAX_FILES} files.`);
    setFileError(null);
    setFiles((f) => [...f, ...incoming]);
  }

  async function upload(taskId: string): Promise<Attachment[]> {
    const { storage } = getFirebase();
    const out: Attachment[] = [];
    for (const file of files) {
      const r = ref(storage, `tasks/${taskId}/${Date.now()}-${safeName(file.name)}`);
      await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
      out.push({ name: file.name, url: await getDownloadURL(r), size: file.size, type: file.type || "application/octet-stream" });
    }
    return out;
  }

  async function onSubmit(values: z.output<typeof formSchema>) {
    setFormError(null);
    const raw = getValues();
    const base = {
      title: raw.title, description: raw.description, priority: raw.priority, date: raw.date, dueTime: raw.dueTime,
      assigneeId: raw.assigneeId, requiresReview: raw.requiresReview,
    };
    try {
      let taskId = task?.id;
      let subtasks = values.subtasks.map((s) => ({ ...(s.id ? { id: s.id } : {}), title: s.title }));
      if (!task) {
        taskId = (await apiFetch<{ taskId: string }>("/api/admin/tasks", "POST", { ...base, subtasks: values.subtasks.map((s) => s.title) })).taskId;
      }

      let attachmentsFailed = false;
      let attachments = existing;
      if (taskId && (files.length > 0 || (task && existing.length !== task.attachments.length))) {
        try {
          attachments = [...existing, ...(await upload(taskId))];
        } catch {
          attachmentsFailed = true;
        }
        if (!attachmentsFailed) {
          if (!task) {
            // The server minted checklist ids on create; re-read them so the follow-up edit keeps them.
            const created = await getDoc(doc(getFirebase().db, "tasks", taskId));
            subtasks = ((created.data() as TaskDoc | undefined)?.subtasks ?? []).map((s) => ({ id: s.id, title: s.title }));
          }
          await apiFetch("/api/admin/tasks", "PATCH", { ...base, taskId, subtasks, attachments });
        }
      } else if (task) {
        await apiFetch("/api/admin/tasks", "PATCH", { ...base, taskId, subtasks, attachments });
      }

      // Files the admin removed while editing: best-effort cleanup after the task no longer references them.
      if (task && !attachmentsFailed) {
        const kept = new Set(attachments.map((a) => a.url));
        await Promise.all(task.attachments.filter((a) => !kept.has(a.url)).map((a) => deleteObject(ref(getFirebase().storage, a.url)).catch(() => undefined)));
      }

      toast.success(editing ? "Task updated" : "Task assigned");
      if (attachmentsFailed) toast.warning("Saved, but the attachments couldn't be uploaded. Check that Firebase Storage is enabled.");
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  const businessName = new Map(businesses.map((b) => [b.id, b.name]));
  const selectable = employees.filter((e) => e.status === "active" || e.id === task?.assigneeIds[0]);
  const groups = [...new Set(selectable.map((e) => e.businessId ?? ""))];

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

          <Field id="task-assignee" label="Assign to" required error={errors.assigneeId?.message}>
            {(aria) => (
              <Select {...aria} {...register("assigneeId")}>
                <option value="">Choose a team member…</option>
                {groups.map((g) => (
                  <optgroup key={g} label={businessName.get(g) ?? "No business"}>
                    {selectable
                      .filter((e) => (e.businessId ?? "") === g)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                          {e.status === "disabled" ? " (turned off)" : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>

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

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Attachments</span>
            <ul className="space-y-1">
              {existing.map((a) => (
                <li key={a.url} className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="num text-muted">{formatBytes(a.size)}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${a.name}`} onClick={() => setExisting((l) => l.filter((x) => x.url !== a.url))}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="num text-muted">{formatBytes(f.size)}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${f.name}`} onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <input ref={fileInput} type="file" multiple className="sr-only" aria-label="Choose files to attach" onChange={(e) => addFiles(e.target.files)} />
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => fileInput.current?.click()}>
              <Paperclip aria-hidden /> Attach files
            </Button>
            {fileError ? (
              <p role="alert" className="text-sm text-danger">
                {fileError}
              </p>
            ) : (
              <p className="text-sm text-muted">Up to 10 files, 10 MB each.</p>
            )}
          </div>

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
