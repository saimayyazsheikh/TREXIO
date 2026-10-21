"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AttachmentPicker } from "@/components/features/comms/attachments";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { newClientId, uploadAttachment } from "@/lib/firebase/upload";
import type { TaskDoc } from "@/types/models";

/** A formal help request. Quick chat belongs in Chat; this creates a tracked thread the admin can answer and close. */
export function AskQuestionSheet({ open, onOpenChange, uid, defaultTaskId }: { open: boolean; onOpenChange: (open: boolean) => void; uid: string; defaultTaskId?: string }) {
  const { db } = getFirebase();
  const tasksQ = useMemo(() => (open ? query(collection(db, "tasks"), where("assigneeIds", "array-contains", uid), orderBy("date", "desc"), limit(40)) : null), [db, uid, open]);
  const tasks = useCollection<TaskDoc>(tasksQ);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [taskId, setTaskId] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<{ subject?: string; body?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject("");
    setBody("");
    setTaskId(defaultTaskId ?? "");
    setUrgent(false);
    setFiles([]);
    setErrors({});
  }, [open, defaultTaskId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (subject.trim().length < 3) next.subject = "Give it a short subject";
    if (!body.trim()) next.body = "Describe what you need";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const attachments = [];
      for (const f of files) attachments.push(await uploadAttachment(`u/${uid}/q/${newClientId()}`, f));
      await apiFetch("/api/questions", "POST", { action: "ask", subject, body, urgent, taskId: taskId || null, attachments });
      toast.success("Question sent. You'll see the answer here.");
      onOpenChange(false);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Ask a question"
        description="For help you need an answer to. For a quick word, use Chat instead."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="ask-form" loading={busy}>
              Send question
            </Button>
          </>
        }
      >
        <form id="ask-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field id="ask-subject" label="Subject" required error={errors.subject}>
            {(aria) => <Input {...aria} maxLength={120} autoComplete="off" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="For example: printer keeps jamming" />}
          </Field>
          <Field id="ask-body" label="What do you need?" required error={errors.body}>
            {(aria) => (
              <textarea
                {...aria}
                rows={5}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
              />
            )}
          </Field>
          <Field id="ask-task" label="About one of your tasks (optional)">
            {(aria) => (
              <Select {...aria} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Not about a specific task</option>
                {(tasks.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {t.date}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--brand-from)]" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">This is urgent</span>
              <span className="block text-sm text-muted">It gets flagged so your admin sees it first.</span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Attachments</span>
            <AttachmentPicker files={files} onChange={setFiles} max={5} />
          </div>
          {errors.form ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
