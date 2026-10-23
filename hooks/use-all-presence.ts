"use client";

import { useEffect, useState } from "react";
import { onValue } from "firebase/database";
import { getFirebase } from "@/lib/firebase/client";
import { orgRtdbRef } from "@/lib/firebase/org";
import type { PresenceNode } from "@/lib/domain/presence";

type State = { nodes: Record<string, PresenceNode>; ready: boolean; error: Error | null };

/** Live status of everyone, straight from the Realtime Database (admin only; rules refuse employees). */
export function useAllPresence(): State & { retry: () => void } {
  const { rtdb } = getFirebase();
  const [state, setState] = useState<State>({ nodes: {}, ready: false, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    return onValue(
      orgRtdbRef(rtdb, "presence"),
      (snap) => setState({ nodes: (snap.val() ?? {}) as Record<string, PresenceNode>, ready: true, error: null }),
      (error) => setState({ nodes: {}, ready: true, error }),
    );
  }, [rtdb, attempt]);

  return {
    ...state,
    retry: () => {
      setState({ nodes: {}, ready: false, error: null });
      setAttempt((n) => n + 1);
    },
  };
}
