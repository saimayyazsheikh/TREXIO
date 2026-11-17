"use client";

import { useState } from "react";
import { Check, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pill } from "@/components/features/badges";
import type { ActionKind, ProposedAction } from "@/lib/domain/assistant-actions";
import { cn } from "@/lib/utils";

export type CardStatus = "ready" | "creating" | "created" | "failed" | "skipped";

const CONFIRM: Partial<Record<ActionKind, string>> = {
  "task.update": "Apply",
  "task.delete": "Delete",
  "task.status": "Apply",
  "reminder.send": "Send",
  "leave.decide": "Confirm",
  "routine.create": "Add routine",
  "routine.update": "Apply",
  "routine.delete": "Delete",
  "employee.create": "Add team member",
  "employee.update": "Apply",
  "employee.status": "Confirm",
  "employee.password": "Change password",
  "holiday.add": "Add",
  "holiday.remove": "Remove",
  "business.create": "Add business",
  "business.update": "Apply",
  "settings.update": "Save",
  "open.page": "Open",
};

/**
 * One change the assistant proposes, shown as plain lines. Nothing happens until the button is pressed. A card that needs a password
 * (a new team member, a reset) asks for it right here: it goes straight to the server and never through the assistant.
 */
export function ActionCard({
  a,
  status,
  failure,
  doneMessage,
  busy,
  onConfirm,
  onSkip,
}: {
  a: ProposedAction;
  status: CardStatus;
  failure?: string;
  doneMessage?: string;
  busy: boolean;
  onConfirm: (password?: string) => void;
  onSkip: () => void;
}) {
  const [password, setPassword] = useState("");
  const blocked = a.issues.length > 0 || !a.payload;
  const needsPw = a.needsPassword && password.length < 8;
  const open = status !== "created" && status !== "skipped";

  return (
    <li className={cn("rounded-card border p-3", status === "created" ? "border-success/40 bg-success/6" : status === "skipped" ? "border-border-solid opacity-60" : blocked || status === "failed" ? "border-danger/40" : a.danger ? "border-danger/30" : "border-border-solid")}>
      <div className="flex items-start gap-2">
        <p className={cn("min-w-0 flex-1 font-semibold leading-snug", status === "skipped" && "line-through")}>{a.heading}</p>
        {status === "created" ? (
          <span className={cn(pill, "bg-success/14 text-success")}>
            <Check className="size-3.5" aria-hidden /> Done
          </span>
        ) : null}
      </div>

      {a.lines.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
          {a.lines.filter((line) => status !== "created" || !/password/i.test(line)).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {status === "created" && doneMessage ? <p className="mt-2 text-sm text-success">{doneMessage}</p> : null}

      {a.issues.map((issue) => (
        <p key={issue} className="mt-2 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          {issue}
        </p>
      ))}
      {failure ? <p role="alert" className="mt-2 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{failure}</p> : null}

      {open && a.needsPassword && !blocked ? (
        <label className="mt-3 block text-sm">
          <span className="mb-1 flex items-center gap-1.5 font-medium">
            <KeyRound className="size-4 text-muted" aria-hidden /> {a.kind === "employee.create" ? "Choose their password" : "Choose the new password"}
          </span>
          <Input type="password" autoComplete="new-password" minLength={8} maxLength={128} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
          <span className="mt-1 block text-xs text-muted">Only you and the server see this. It is never sent to the assistant.</span>
        </label>
      ) : null}

      {open ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
          {a.kind !== "open.page" ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
              <X aria-hidden /> Skip
            </Button>
          ) : null}
          <Button size="sm" variant={a.danger ? "danger" : "primary"} loading={status === "creating"} disabled={busy || blocked || needsPw} onClick={() => onConfirm(a.needsPassword ? password : undefined)}>
            <Check aria-hidden /> {a.kind === "leave.decide" && a.payload?.kind === "leave.decide" ? (a.payload.decision === "approve" ? "Approve" : "Reject") : a.kind === "employee.status" && a.payload?.kind === "employee.status" ? (a.payload.status === "disabled" ? "Turn off" : "Turn on") : (CONFIRM[a.kind] ?? "Confirm")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
