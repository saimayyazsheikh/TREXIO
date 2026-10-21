"use client";

import { useCallback, useEffect, useState } from "react";
import { onSnapshot, type DocumentReference } from "firebase/firestore";
import type { WithId } from "@/types/models";

type State<T> = { data: WithId<T> | null | undefined; error: Error | null };

/** Live single document. `data === undefined` = loading, `null` = doesn't exist. Pass a memoised ref. */
export function useDocument<T>(ref: DocumentReference | null) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ref) return;
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...(snap.data() as T) } : null, error: null }),
      (error) => setState({ data: undefined, error }),
    );
  }, [ref, attempt]);

  const retry = useCallback(() => {
    setState({ data: undefined, error: null });
    setAttempt((n) => n + 1);
  }, []);

  return { data: state.data, error: state.error, loading: !!ref && state.data === undefined && !state.error, retry };
}
