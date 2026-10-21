"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AttachmentPicker } from "@/components/features/comms/attachments";
import { TaskLinkField } from "@/components/features/tasks/task-link-field";
import { apiFetch } from "@/lib/api-client";
import { newClientId, uploadAttachment } from "@/lib/firebase/upload";
import { cn } from "@/lib/utils";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

/** Compose a reminder: who, what, an optional linked task and files. Files go up first, then the server sends it. */
export function ReminderSheet({
  open,
  onOpenChange,
  employees,
  businesses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: WithId<UserDoc>[];
  businesses: WithId<BusinessDoc>[];
}) {
  const [everyone, setEveryone] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEveryone(false);
    setPicked([]);
    setBody("");
    setTaskIds([]);
    setTitles({});
    setFiles([]);
    setError(null);
  }, [open]);

  const active = employees.filter((e) => e.status === "active");
  const groups = businesses.map((b) => ({ business: b, people: active.filter((e) => e.businessId === b.id) })).filter((g) => g.people.length > 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError("Write a message first.");
    if (!everyone && picked.length === 0) return setError("Choose who should get it.");
    setBusy(true);
    setError(null);
    try {
      const id = newClientId();
      const attachments = [];
      for (const f of files) attachments.push(await uploadAttachment(`reminders/${id}`, f));
      const res = await apiFetch<{ recipients: number }>("/api/admin/reminders", "POST", { id, body, toUids: everyone ? [] : picked, toAll: everyone, taskId: taskIds[0] ?? null, attachments });
      toast.success(`Reminder sent to ${res.recipients} ${res.recipients === 1 ? "person" : "people"}`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Send a reminder"
        description="A short nudge that shows on their Reminders page. You'll see who has read it."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="reminder-form" loading={busy}>
              Send reminder
            </Button>
          </>
        }
      >
        <form id="reminder-form" onSubmit={send} className="flex flex-col gap-5" noValidate>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">
              Who should get it? <span aria-hidden className="text-danger">*</span>
            </legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-surface-raised">
              <input type="checkbox" className="size-5 accent-[var(--brand-from)]" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              <span className="text-sm font-medium">Everyone ({active.length} active)</span>
            </label>
            <div className={cn("mt-1 space-y-3", everyone && "pointer-events-none opacity-50")} aria-disabled={everyone}>
              {groups.map(({ business, people }) => (
                <div key={business.id}>
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{business.name}</p>
                  <ul>
                    {people.map((p) => (
                      <li key={p.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-surface-raised">
                          <input type="checkbox" className="size-5 accent-[var(--brand-from)]" disabled={everyone} checked={everyone || picked.includes(p.id)} onChange={() => toggle(p.id)} />
                          <span className="text-sm">
                            {p.name}
                            {p.designation ? <span className="text-muted"> · {p.designation}</span> : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {groups.length === 0 ? <p className="px-1 text-sm text-muted">No active team members yet.</p> : null}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reminder-body" className="text-sm font-medium">
              Message <span aria-hidden className="text-danger">*</span>
            </label>
            <textarea
              id="reminder-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
              placeholder="For example: please send me yesterday's cash report before noon"
            />
            <p className="num text-right text-xs text-muted">{body.length}/2000</p>
          </div>

          <TaskLinkField
            label="Link a task (optional)"
            hint="Shows the task title with the reminder."
            value={taskIds}
            onChange={setTaskIds}
            titles={titles}
            onTitle={(id, title) => setTitles((t) => ({ ...t, [id]: title }))}
            max={1}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Attachments</span>
            <AttachmentPicker files={files} onChange={setFiles} max={10} />
          </div>

          {error ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
