"use client";

import { useEffect, useRef, useState } from "react";
import { armChime, playChime, setSoundEnabled, soundEnabled } from "@/lib/client/chime";

/**
 * Tells you a notification arrived without opening the page: a chime, and while the window is hidden the tab title flashes
 * "New notification". Notifications already there when the page opens stay quiet.
 */
export function useNotificationAlert(unread: { id: string }[], ready: boolean) {
  const known = useRef<Set<string> | null>(null);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    armChime();
    setSound(soundEnabled());
  }, []);

  useEffect(() => {
    if (!ready) return;
    const ids = new Set(unread.map((n) => n.id));
    if (known.current === null) {
      known.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !known.current!.has(id));
    known.current = ids;
    if (fresh.length === 0) return;
    if (soundEnabled()) playChime();
    if (document.visibilityState !== "visible") {
      const original = document.title.replace(/^\(\d+\) /, "");
      let on = true;
      const flash = setInterval(() => {
        document.title = on ? `(${ids.size}) New notification` : original;
        on = !on;
      }, 1200);
      const stop = () => {
        if (document.visibilityState !== "visible") return;
        clearInterval(flash);
        document.title = original;
        document.removeEventListener("visibilitychange", stop);
      };
      document.addEventListener("visibilitychange", stop);
    }
  }, [unread, ready]);

  return {
    sound,
    toggleSound: () => {
      setSoundEnabled(!sound);
      setSound(!sound);
    },
  };
}
