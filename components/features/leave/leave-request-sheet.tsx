"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/time-field";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-client";
import { assertValidLeave, leaveActionSchema, type NewLeave } from "@/lib/domain/timeoff";
import { cn } from "@/lib/utils";
import { pktDateString } from "@/lib/time";

type Kind = "leave" | "excuse";

/** Ask for whole days off, or a few hours (a short excuse). Your admin approves or declines. */
export function LeaveRequestSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<Kind>("leave");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = pktDateString();
    setKind("leave");
    setFromDate(today);
    setToDate(today);
    setFromTime("");
    setToTime("");
    setReason("");
    setError(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const draft = { action: "create", kind, fromDate, toDate: kind === "excuse" ? fromDate : toDate, fromTime: kind === "excuse" ? fromTime : "", toTime: kind === "excuse" ? toTime : "", reason };
    const parsed = leaveActionSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    try {
      assertValidLeave(parsed.data as NewLeave, pktDateString());
    } catch (err) {
      return setError(err instanceof Error ? err.message : "Check the dates and try again.");
    }
    setBusy(true);
    try {
      await apiFetch("/api/leave", "POST", draft);
      toast.success("Request sent. Your admin will decide soon.");
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
        title="Request time off"
        description="Whole days off, or a short excuse for a few hours. Approved leave pauses your daily tasks."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="leave-form" loading={busy}>
              Send request
            </Button>
          </>
        }
      >
        <form id="leave-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">What do you need?</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["leave", "Days off", "One or more whole days"],
                  ["excuse", "Short excuse", "A few hours on one day"],
                ] as const
              ).map(([value, title, help]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={cn("flex min-h-16 flex-col items-start rounded-control border px-3 py-2 text-left transition-colors", kind === value ? "border-ring bg-surface-raised" : "border-input hover:bg-surface-raised")}
                >
                  <span className="text-sm font-semibold">{title}</span>
                  <span className="text-xs text-muted">{help}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {kind === "leave" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field id="leave-from" label="From" required>
                {(aria) => <Input {...aria} type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (toDate < e.target.value) setToDate(e.target.value); }} />}
              </Field>
              <Field id="leave-to" label="To (last day)" required>
                {(aria) => <Input {...aria} type="date" min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} />}
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Field id="excuse-date" label="Day" required>
                {(aria) => <Input {...aria} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />}
              </Field>
              <Field id="excuse-from" label="From" required>
                {(aria) => <TimeField {...aria} value={fromTime} onChange={setFromTime} />}
              </Field>
              <Field id="excuse-to" label="Until" required>
                {(aria) => <TimeField {...aria} value={toTime} onChange={setToTime} />}
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="leave-reason" className="text-sm font-medium">
              Reason <span aria-hidden className="text-danger">*</span>
            </label>
            <textarea
              id="leave-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
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
