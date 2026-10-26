"use client";

import { useState, useSyncExternalStore } from "react";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVER_SNAPSHOT, enableSystemIdle, getSystemIdle, subscribeSystemIdle } from "@/lib/client/system-idle";

const DISMISSED = "traxio:system-idle-dismissed";

/** Asks once, with a click, to let the browser say when the whole computer is unused. Only shown where the browser supports it. */
export function SystemIdlePrompt({ idleMin }: { idleMin: number }) {
  const { status } = useSyncExternalStore(subscribeSystemIdle, getSystemIdle, () => SERVER_SNAPSHOT);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  if (status !== "prompt" || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {
      /* fine: it just asks again next visit */
    }
  };

  return (
    <div role="region" aria-label="Idle time" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border-solid bg-surface-solid p-4 shadow-[var(--shadow-3)] md:bottom-6">
      <Monitor className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Count my idle time properly</p>
        <p className="mt-0.5 text-xs text-muted">
          Let your browser tell Traxio when your computer is unused or locked, so working in other apps still counts as active. Traxio never sees which apps or sites you use.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => void enableSystemIdle(idleMin * 60_000).then(dismiss)}>
            Allow
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
