"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { getFirebase } from "@/lib/firebase/client";

/** Signed out after this long with no mouse, keyboard, touch or scroll in any Traxio tab. */
export const IDLE_LIMIT_MS = 60 * 60 * 1000;
/** The last minute is a countdown with a way to stay signed in. */
const WARN_MS = 60 * 1000;
const KEY = "traxio:last-active";
const EVENTS = ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;

const read = () => {
  try {
    return Number(localStorage.getItem(KEY)) || Date.now();
  } catch {
    return Date.now();
  }
};

/**
 * Signs the person out after an hour of no activity. The clock is shared through localStorage, so having Traxio open in
 * several tabs counts as one person, and activity in any of them keeps everyone signed in.
 */
export function IdleLogout({ onBeforeSignOut }: { onBeforeSignOut?: () => Promise<void> }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Kept in a ref so a new function on every render doesn't restart the idle clock.
  const before = useRef(onBeforeSignOut);
  before.current = onBeforeSignOut;

  useEffect(() => {
    let last = Date.now();
    let written = 0;
    let leaving = false;
    const touch = () => {
      const now = Date.now();
      last = now;
      if (now - written > 5000) {
        written = now;
        try {
          localStorage.setItem(KEY, String(now));
        } catch {
          /* private mode: this tab's own clock still works */
        }
      }
    };
    touch();
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    async function leave() {
      if (leaving) return;
      leaving = true;
      try {
        await before.current?.();
        await fetch("/api/auth/session", { method: "DELETE" });
        await signOut(getFirebase().auth);
      } finally {
        window.location.assign("/login?reason=idle");
      }
    }

    const timer = setInterval(() => {
      const idle = Date.now() - Math.max(last, read());
      if (idle >= IDLE_LIMIT_MS) void leave();
      else setSecondsLeft(idle >= IDLE_LIMIT_MS - WARN_MS ? Math.ceil((IDLE_LIMIT_MS - idle) / 1000) : null);
    }, 1000);
    return () => {
      clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
    };
  }, []);

  if (secondsLeft === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Signing out soon" className="fixed inset-x-3 bottom-20 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border-solid bg-surface-solid p-4 shadow-[var(--shadow-3)] md:bottom-6">
      <p className="min-w-0 flex-1 text-sm">
        You&apos;ve been away for a while. Signing out in <span className="num font-semibold">{secondsLeft}s</span>.
      </p>
      <Button size="sm" onClick={() => setSecondsLeft(null)}>
        Stay signed in
      </Button>
    </div>
  );
}
