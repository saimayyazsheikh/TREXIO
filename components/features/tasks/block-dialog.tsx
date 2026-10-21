"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MAX_BLOCK_REASON } from "@/lib/domain/tasks";

/** Moving a task to Blocked needs a reason; it's shown on the card and kept in the audit log. */
export function BlockDialog({
  title,
  onOpenChange,
  onConfirm,
}: {
  /** Title of the task being blocked; the dialog is open when this is set. */
  title: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 3;

  useEffect(() => {
    if (title) setReason("");
  }, [title]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort) return;
    setBusy(true);
    const ok = await onConfirm(trimmed);
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={!!title} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>What&apos;s blocking this?</DialogTitle>
        <DialogDescription>“{title}” will move to Blocked. Your reason shows on the card so everyone knows what&apos;s needed.</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3" noValidate>
          <label htmlFor="block-reason" className="text-sm font-medium">
            Reason <span aria-hidden className="text-danger">*</span>
          </label>
          <textarea
            id="block-reason"
            rows={3}
            value={reason}
            maxLength={MAX_BLOCK_REASON}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: waiting for the supplier's invoice"
            className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
          />
          <p className="num text-right text-xs text-muted">
            {reason.length}/{MAX_BLOCK_REASON}
          </p>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" loading={busy} disabled={tooShort}>
              Mark as blocked
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
