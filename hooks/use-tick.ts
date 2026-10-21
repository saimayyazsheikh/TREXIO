"use client";

import { useEffect, useState } from "react";

/** Re-renders the component every `ms` milliseconds (for things that expire, like typing indicators). */
export function useTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
