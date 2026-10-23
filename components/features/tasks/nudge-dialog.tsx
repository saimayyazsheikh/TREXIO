"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, MessageCircleMore } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgDocument } from "@/lib/firebase/org";
import { nudgeDefault } from "@/lib/domain/automation";
import { TASK_STATUS_LABEL } from "@/lib/domain/constants";
import { waLink } from "@/lib/domain/whatsapp-link";
import type { TaskDoc, UserDoc, WithId } from "@/types/models";

/**
 * Admin: a WhatsApp nudge about one task. Traxio doesn't send it. The button opens WhatsApp (app or web) on that person's
 * chat with the message already typed, and the admin presses send there.
 */
export function NudgeDialog({ task, open, onOpenChange, defaultUid }: { task: WithId<TaskDoc>; open: boolean; onOpenChange: (open: boolean) => void; defaultUid?: string }) {
  const [uid, setUid] = useState(defaultUid ?? task.assigneeIds[0]);
  const [message, setMessage] = useState("");

  const draft = (who: string) => nudgeDefault({ employeeName: task.assigneeNames[who] ?? "there", title: task.title, dueAtMs: task.dueAt?.toMillis() ?? null, status: TASK_STATUS_LABEL[task.status] });

  useEffect(() => {
    if (!open) return;
    const who = defaultUid ?? task.assigneeIds[0];
    setUid(who);
    setMessage(draft(who));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultUid, task.id]);

  const userRef = useMemo(() => (open && uid ? orgDocument(getFirebase().db, "users", uid) : null), [open, uid]);
  const person = useDocument<UserDoc>(userRef);
  const name = task.assigneeNames[uid] ?? "them";
  const link = message.trim().length >= 3 ? waLink(person.data?.phone, message) : null;
  const noNumber = !person.loading && !!person.data && !waLink(person.data.phone, "x");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2">
          <MessageCircleMore className="size-5 text-brand-text" aria-hidden /> Nudge on WhatsApp
        </DialogTitle>
        <DialogDescription>About “{task.title}”. Edit the message if you like. WhatsApp opens with it ready, and you press send there.</DialogDescription>
        <div className="mt-4 flex flex-col gap-4">
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
          {noNumber ? (
            <p role="alert" className="rounded-control bg-warning/10 px-3 py-2 text-sm text-warning">
              {name} has no WhatsApp number yet. <Link href="/admin/settings/team" className="font-semibold underline underline-offset-2">Add one in Team</Link> (like +923001234567).
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            {link ? (
              <Button asChild>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    toast.success(`WhatsApp is opening on ${name}'s chat. Press send there.`);
                    onOpenChange(false);
                  }}
                >
                  Open WhatsApp <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : (
              <Button type="button" disabled>
                Open WhatsApp
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
