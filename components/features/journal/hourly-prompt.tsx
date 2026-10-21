"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useJournalEditor } from "@/hooks/use-journal-editor";
import { useMyHours } from "@/hooks/use-my-hours";
import { useNow } from "@/hooks/use-now";
import { MAX_SLOT_TEXT, SNOOZE_MS, promptDue, slotFilled, slotLabel } from "@/lib/domain/journal";
import { pktDateString } from "@/lib/time";

/**
 * The smart hourly prompt: at :55 of a working hour with an empty journal entry, ask what you did. Fill it in
 * right here, snooze for 3 minutes, or skip the hour. When the tab is hidden and you allowed it, also a browser notification.
 */
export function HourlyPrompt({ uid }: { uid: string }) {
  const now = useNow();
  const today = pktDateString(now);
  const hours = useMyHours(uid);
  const journal = useJournalEditor(uid, today, true);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [text, setText] = useState("");
  const handled = useRef(new Set<string>());
  const snoozedUntil = useRef<number | null>(null);

  // Decide whether to prompt (re-checked every 30 s by the clock, and whenever the journal changes).
  useEffect(() => {
    if (activeKey || hours.loading || journal.loading) return;
    const key = promptDue(now, { expected: hours.expected, slots: journal.slots, handled: handled.current, snoozedUntilMs: snoozedUntil.current });
    if (!key) return;
    setActiveKey(key);
    setText("");
    if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification("Time to log your hour", { body: `What did you work on from ${slotLabel(key)}?`, tag: `journal-${today}-${key}` });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  }, [now, activeKey, hours.expected, hours.loading, journal.loading, journal.slots, today]);

  // If the hour got filled somewhere else (another tab, the journal page), the prompt goes away.
  useEffect(() => {
    if (activeKey && slotFilled(journal.slots[activeKey])) {
      handled.current.add(`${today}-${activeKey}`);
      setActiveKey(null);
    }
  }, [activeKey, journal.slots, today]);

  function close(handledHour: boolean) {
    if (activeKey && handledHour) handled.current.add(`${today}-${activeKey}`);
    setActiveKey(null);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!activeKey || !text.trim()) return;
    journal.update(activeKey, { text: text.trim(), taskIds: journal.slots[activeKey]?.taskIds ?? [] }, { immediate: true });
    close(true);
  }

  return (
    <Dialog open={!!activeKey} onOpenChange={(o) => !o && (snoozedUntil.current = Date.now() + SNOOZE_MS, close(false))}>
      <DialogContent>
        {activeKey ? (
          <>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="size-5 text-brand-text" aria-hidden /> Time to log your hour
            </DialogTitle>
            <DialogDescription>What did you work on from {slotLabel(activeKey)}? A line or two is enough.</DialogDescription>
            <form onSubmit={save} className="mt-4 flex flex-col gap-3">
              <label htmlFor="prompt-text" className="sr-only">
                What did you do from {slotLabel(activeKey)}?
              </label>
              <textarea
                id="prompt-text"
                rows={3}
                autoFocus
                maxLength={MAX_SLOT_TEXT}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="For example: counted stock on shelves A and B"
                className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/me/journal" onClick={() => close(true)}>
                    Open my journal
                  </Link>
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      snoozedUntil.current = Date.now() + SNOOZE_MS;
                      close(false);
                    }}
                  >
                    Snooze 3 min
                  </Button>
                  <Button type="submit" disabled={!text.trim()}>
                    Save entry
                  </Button>
                </div>
              </div>
              <button type="button" onClick={() => close(true)} className="self-start text-sm text-muted underline underline-offset-2 hover:text-foreground">
                Skip this hour
              </button>
            </form>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
