"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgDocument } from "@/lib/firebase/org";
import { journalId, type Slot, type Slots } from "@/lib/domain/journal";
import { pktDayIndex } from "@/lib/time";
import type { JournalDoc } from "@/types/models";

const SAVE_DELAY_MS = 800;
export type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };

/**
 * Live journal for one day plus autosaving edits. Edits show instantly, are written (debounced) with merge writes
 * of just the changed hour, and flush when you leave the page. The database rules refuse writes to any day but today.
 */
export function useJournalEditor(uid: string, date: string, editable: boolean) {
  const { db } = getFirebase();
  const ref = useMemo(() => orgDocument(db, "journals", journalId(uid, date)), [db, uid, date]);
  const remote = useDocument<JournalDoc>(ref);

  const [local, setLocal] = useState<Record<string, Slot>>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const localRef = useRef(local);
  localRef.current = local;

  const write = useCallback(
    async (key: string, slot: Slot) => {
      setSave({ status: "saving" });
      try {
        await setDoc(
          ref,
          { employeeId: uid, date, dayIndex: pktDayIndex(), slots: { [key]: { text: slot.text, taskIds: slot.taskIds, updatedAt: serverTimestamp() } }, updatedAt: serverTimestamp() },
          { merge: true },
        );
        // Drop the local copy only if nothing newer was typed meanwhile.
        setLocal((l) => (l[key] === slot ? Object.fromEntries(Object.entries(l).filter(([k]) => k !== key)) : l));
        setSave({ status: "saved" });
      } catch (error) {
        const denied = (error as { code?: string }).code === "permission-denied";
        setSave({
          status: "error",
          message: denied
            ? "Couldn't save. This day may have just locked at midnight, or your device clock is off. Refresh the page and try again."
            : "Couldn't save. Check your connection; we'll keep your text on screen.",
        });
      }
    },
    [ref, uid, date],
  );

  const update = useCallback(
    (key: string, next: Slot, opts: { immediate?: boolean } = {}) => {
      if (!editable) return;
      setLocal((l) => ({ ...l, [key]: next }));
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => void write(key, next), opts.immediate ? 0 : SAVE_DELAY_MS);
    },
    [editable, write],
  );

  /** Writes any waiting edits right now (on blur, on leaving the page, when the tab closes). */
  const flush = useCallback(() => {
    for (const [key, timer] of Object.entries(timers.current)) {
      clearTimeout(timer);
      delete timers.current[key];
      const pending = localRef.current[key];
      if (pending) void write(key, pending);
    }
  }, [write]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const slots: Slots = useMemo(() => {
    const merged: Slots = {};
    for (const [k, v] of Object.entries(remote.data?.slots ?? {})) if (v) merged[k] = { text: v.text, taskIds: v.taskIds };
    return { ...merged, ...local };
  }, [remote.data, local]);

  return { slots, update, flush, save, loading: remote.loading, error: remote.error, retry: remote.retry, lastSaved: remote.data?.updatedAt ?? null };
}
