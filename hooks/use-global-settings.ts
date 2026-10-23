"use client";

import { useMemo } from "react";

import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgDocument } from "@/lib/firebase/org";
import { DEFAULT_SETTINGS, SETTINGS_PATH, resolveSettings, type AutomationSettings } from "@/lib/domain/automation";

/** The admin's automation settings, live. Until they load (or if none were saved) the defaults apply. */
export function useGlobalSettings(): { settings: AutomationSettings; loading: boolean; saved: boolean; error: Error | null; retry: () => void } {
  const ref = useMemo(() => orgDocument(getFirebase().db, SETTINGS_PATH), []);
  const snap = useDocument<Record<string, unknown>>(ref);
  const settings = useMemo(() => (snap.data ? resolveSettings(snap.data) : DEFAULT_SETTINGS), [snap.data]);
  return { settings, loading: snap.loading, saved: !!snap.data, error: snap.error, retry: snap.retry };
}
