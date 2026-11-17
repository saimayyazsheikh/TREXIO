"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TimeField } from "@/components/ui/time-field";
import { useDocument } from "@/hooks/use-document";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgDocument } from "@/lib/firebase/org";
import { quietHoursSchema } from "@/lib/domain/quiet-hours";
import type { UserDoc } from "@/types/models";

/** Pick the hours when browser and phone alerts stay silent. The bell and the chime inside Traxio carry on as usual. */
export function QuietHoursDialog({ uid, open, onOpenChange }: { uid: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ref = useMemo(() => orgDocument(getFirebase().db, "users", uid), [uid]);
  const user = useDocument<UserDoc>(open ? ref : null);
  const saved = user.data?.quietHours ?? null;
  const [enabled, setEnabled] = useState(false);
  const [from, setFrom] = useState("22:00");
  const [to, setTo] = useState("07:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEnabled(!!saved);
    setFrom(saved?.from ?? "22:00");
    setTo(saved?.to ?? "07:00");
    setError(null);
    // Start from what is saved each time the dialog opens, not on every refresh of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user.data === null]);

  async function save() {
    const parsed = quietHoursSchema.safeParse({ enabled, from, to });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the times.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/me/quiet-hours", "POST", parsed.data);
      toast.success(enabled ? `Quiet from ${from} to ${to}` : "Quiet hours are off");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Quiet hours</DialogTitle>
        <DialogDescription>During these hours Traxio won&apos;t send alerts to your phone or browser. Everything still waits in the bell for you.</DialogDescription>

        <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Keep my alerts quiet
        </label>

        <div className={`mt-3 grid grid-cols-2 gap-3 ${enabled ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!enabled}>
          <div className="flex flex-col gap-1.5">
            <span id="quiet-from-label" className="text-sm font-medium">From</span>
            <TimeField aria-labelledby="quiet-from-label" value={from} onChange={setFrom} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="quiet-to-label" className="text-sm font-medium">Until</span>
            <TimeField aria-labelledby="quiet-to-label" value={to} onChange={setTo} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Pakistan time. A night such as 10:00 PM to 7:00 AM works across midnight.</p>

        {error ? (
          <p role="alert" className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
