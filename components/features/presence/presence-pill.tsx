"use client";

import { useState } from "react";
import { Coffee, Eye, Moon, Play, Sparkles, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { goOffline, usePresence } from "@/hooks/use-presence";
import { useTick } from "@/hooks/use-tick";
import { apiFetch } from "@/lib/api-client";
import { BREAK_LABEL, formatDuration, type BreakType } from "@/lib/domain/presence";
import { cn } from "@/lib/utils";

export { goOffline };

const NOTICE = "Traxio only learns whether your computer is in use or locked (if you allow it), or else whether this tab is being used. It never sees which apps or sites you open. No screenshots, no keystroke logging.";

async function breakCall(body: Record<string, unknown>) {
  try {
    await apiFetch("/api/breaks", "POST", body);
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Something went wrong.");
    return false;
  }
}

/** Your live status, with one-click breaks. The admin sees the same status on their board. */
export function PresencePill({ uid, name, idleMin }: { uid: string; name: string; idleMin: number | null }) {
  const me = usePresence(uid, name, idleMin);
  useTick(1000);
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const onBreak = me.state === "break" && me.openBreak;
  const elapsed = onBreak ? formatTimer((Date.now() - me.openBreak!.startAtMs) / 1000) : null;

  const tone = onBreak
    ? { dot: "bg-info", text: `On break · ${BREAK_LABEL[me.openBreak!.type]}`, icon: Coffee }
    : me.state === "idle"
      ? { dot: "bg-warning", text: "Idle", icon: Moon }
      : { dot: "bg-success", text: "Active", icon: Sparkles };

  async function start(type: BreakType, noteText = "") {
    setBusy(true);
    await breakCall({ action: "start", type, note: noteText });
    setBusy(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Your status: ${tone.text}${elapsed ? `, ${elapsed}` : ""}. Open the break menu`}
            className="flex min-h-11 items-center gap-2 rounded-full border border-border-solid bg-surface-solid/70 px-3 text-sm font-medium transition-colors hover:bg-surface-raised"
          >
            <span aria-hidden className={cn("size-2.5 rounded-full", tone.dot, me.state === "online" && "animate-pulse")} />
            <tone.icon className="size-4 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">{tone.text}</span>
            {elapsed ? <span className="num hidden sm:inline">{elapsed}</span> : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{onBreak ? `On break since ${formatTimer((Date.now() - me.openBreak!.startAtMs) / 1000)}` : me.state === "idle" ? `Idle for ${formatDuration((Date.now() - (me.idleSinceMs ?? Date.now())) / 1000)}` : "You're active"}</DropdownMenuLabel>
          {onBreak ? (
            <DropdownMenuItem disabled={busy} onSelect={() => void breakCall({ action: "end" })}>
              <Play aria-hidden /> End my break
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem disabled={busy} onSelect={() => void start("namaz")}>
                <Moon aria-hidden /> Start a Namaz break
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={() => void start("lunch")}>
                <Utensils aria-hidden /> Start a lunch break
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={() => setOtherOpen(true)}>
                <Coffee aria-hidden /> Start another break…
              </DropdownMenuItem>
            </>
          )}
          <p className="flex gap-2 border-t px-2.5 pb-1.5 pt-2.5 text-xs text-muted">
            <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {NOTICE}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={otherOpen} onOpenChange={setOtherOpen}>
        <DialogContent>
          <DialogTitle>Start a break</DialogTitle>
          <DialogDescription>Add a short note if you like. Your admin sees that you&apos;re on a break.</DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await breakCall({ action: "start", type: "other", note });
              setBusy(false);
              if (ok) {
                setOtherOpen(false);
                setNote("");
              }
            }}
          >
            <label htmlFor="break-note" className="text-sm font-medium">
              Note (optional)
            </label>
            <input
              id="break-note"
              value={note}
              maxLength={200}
              autoFocus
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: doctor's call"
              className="h-11 w-full rounded-control border border-input bg-surface-solid px-3 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={busy}>
                Start break
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatTimer(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
