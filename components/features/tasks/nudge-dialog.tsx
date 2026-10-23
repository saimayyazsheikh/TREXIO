"use client";

import { useEffect, useState } from "react";
import { MessageCircleMore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { nudgeDefault } from "@/lib/domain/automation";
import { TASK_STATUS_LABEL } from "@/lib/domain/constants";
import type { TaskDoc, WithId } from "@/types/models";

/** Admin: a WhatsApp nudge about one task, with an editable message prefilled from the task. */
export function NudgeDialog({ task, open, onOpenChange, defaultUid }: { task: WithId<TaskDoc>; open: boolean; onOpenChange: (open: boolean) => void; defaultUid?: string }) {
  const [uid, setUid] = useState(defaultUid ?? task.assigneeIds[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = (who: string) => nudgeDefault({ employeeName: task.assigneeNames[who] ?? "there", title: task.title, dueAtMs: task.dueAt?.toMillis() ?? null, status: TASK_STATUS_LABEL[task.status] });

  useEffect(() => {
    if (!open) return;
    const who = defaultUid ?? task.assigneeIds[0];
    setUid(who);
    setMessage(draft(who));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultUid, task.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ status: "sent" | "mock" }>("/api/whatsapp/send", "POST", { taskId: task.id, toUid: uid, message });
      toast.success(res.status === "mock" ? "Saved in test mode: nothing was sent to WhatsApp yet." : `WhatsApp sent to ${task.assigneeNames[uid] ?? "them"}.`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2">
          <MessageCircleMore className="size-5 text-brand-text" aria-hidden /> Send a WhatsApp nudge
        </DialogTitle>
        <DialogDescription>About “{task.title}”. Edit the message if you like; it goes to their WhatsApp number.</DialogDescription>
        <form onSubmit={send} className="mt-4 flex flex-col gap-4">
          {task.assigneeIds.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nudge-to" className="text-sm font-medium">
                Send to
              </label>
              <Select
                id="nudge-to"
                value={uid}
                onChange={(e) => {
                  setUid(e.target.value);
                  setMessage(draft(e.target.value));
                }}
              >
                {task.assigneeIds.map((id) => (
                  <option key={id} value={id}>
                    {task.assigneeNames[id] ?? "Teammate"}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nudge-message" className="text-sm font-medium">
              Message
            </label>
            <textarea
              id="nudge-message"
              rows={5}
              maxLength={600}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
            <p className="num text-right text-xs text-muted">{message.length}/600</p>
          </div>
          {error ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={busy} disabled={message.trim().length < 3}>
              Send WhatsApp
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
