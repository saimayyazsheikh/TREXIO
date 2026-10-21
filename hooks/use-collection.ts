"use client";

import { useCallback, useEffect, useState } from "react";
import { onSnapshot, type Query } from "firebase/firestore";
import type { WithId } from "@/types/models";

type State<T> = { data: WithId<T>[] | null; error: Error | null };

/**
 * Live Firestore query. `data === null && !error` means loading. Pass a memoised query (or null to pause).
 * `retry` re-subscribes after an error.
 */
export function useCollection<T>(q: Query | null) {
  const [state, setState] = useState<State<T>>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!q) return;
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), error: null }),
      (error) => setState({ data: null, error }),
    );
  }, [q, attempt]);

  const retry = useCallback(() => {
    setState({ data: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  return { data: state.data, error: state.error, loading: !!q && state.data === null && !state.error, retry };
}
