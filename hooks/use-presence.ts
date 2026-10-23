"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onDisconnect, onValue, ref, serverTimestamp as rtdbTimestamp, set, update } from "firebase/database";
import { getDoc, increment, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument, orgRtdbRef } from "@/lib/firebase/org";
import { DEFAULT_IDLE_MIN, accrue, computeState, type BreakType, type Totals } from "@/lib/domain/presence";
import { pktDateString } from "@/lib/time";

const TICK_MS = 10_000;
const BEAT_EVERY_MS = 60_000;
const FLUSH_EVERY_MS = 60_000;
const ZERO: Totals = { activeSec: 0, idleSec: 0, breakSec: 0 };

type OpenBreak = { id: string; type: BreakType; note: string; startAtMs: number } | null;
export type MyPresence = { state: "online" | "idle" | "break"; idleSinceMs: number | null; openBreak: OpenBreak };

/** Marks you offline right now. Call before signing out, so the admin doesn't see a ghost "Online". */
export async function goOffline(uid: string) {
  const node = orgRtdbRef(getFirebase().rtdb, `presence/${uid}`);
  await set(node, { state: "offline", since: rtdbTimestamp(), lastBeat: rtdbTimestamp() }).catch(() => undefined);
}

/**
 * Tracks activity INSIDE this Traxio tab only (mouse, keyboard, touch, scroll). It publishes your live status for the
 * admin, adds up active / idle / break seconds, and saves them once a minute. Nothing outside the tab is observed.
 */
export function usePresence(uid: string, name: string, idleMin: number | null): MyPresence {
  const { db, rtdb } = getFirebase();

  const openQ = useMemo(() => query(orgCollection(db, "breaks"), where("employeeId", "==", uid), where("endAt", "==", null)), [db, uid]);
  const open = useCollection<{ type: BreakType; note: string; date: string; startAt: { toMillis(): number } }>(openQ);
  const today = pktDateString();
  const openBreak: OpenBreak = useMemo(() => {
    const b = (open.data ?? []).find((x) => x.date >= today);
    return b ? { id: b.id, type: b.type, note: b.note, startAtMs: b.startAt.toMillis() } : null;
  }, [open.data, today]);

  const [view, setView] = useState<MyPresence>({ state: "online", idleSinceMs: null, openBreak: null });
  const breakRef = useRef<OpenBreak>(null);
  breakRef.current = openBreak;
  const lastActivity = useRef(Date.now());
  const idleMinRef = useRef(idleMin ?? DEFAULT_IDLE_MIN);
  idleMinRef.current = idleMin ?? DEFAULT_IDLE_MIN;

  useEffect(() => {
    const node = orgRtdbRef(rtdb, `presence/${uid}`);
    const totalsDoc = () => orgDocument(db, "presenceDaily", `${uid}_${pktDateString()}`);
    let pending: Totals = ZERO;
    let pendingDate = pktDateString();
    let published: { state: string; breakId: string | null } | null = null;
    let connected = false;
    let docKnown: boolean | null = null;
    let lastTick = Date.now();
    let lastBeat = 0;
    let lastFlush = Date.now();
    let flushing = false;
    let idleSince: number | null = null;

    const publish = (state: "online" | "idle" | "break") => {
      const b = breakRef.current;
      const key = { state, breakId: b?.id ?? null };
      if (published && published.state === key.state && published.breakId === key.breakId) return;
      published = key;
      void set(node, { state, since: rtdbTimestamp(), lastBeat: rtdbTimestamp(), ...(state === "break" && b ? { breakType: b.type, breakNote: b.note.slice(0, 200) } : {}) }).catch(() => undefined);
    };

    async function flush() {
      if (flushing) return;
      const sum = pending.activeSec + pending.idleSec + pending.breakSec;
      if (sum === 0) return;
      flushing = true;
      const batch = pending;
      const date = pendingDate;
      pending = ZERO;
      try {
        if (date !== pktDateString()) return; // the day rolled over: yesterday's totals are locked
        const ref = totalsDoc();
        if (docKnown === null) docKnown = (await getDoc(ref)).exists();
        if (docKnown) {
          await updateDoc(ref, { activeSec: increment(batch.activeSec), idleSec: increment(batch.idleSec), breakSec: increment(batch.breakSec), lastSeenAt: serverTimestamp() });
        } else {
          await setDoc(ref, { employeeId: uid, date, ...batch, firstSeenAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
          docKnown = true;
        }
      } catch (error) {
        // A network blip keeps the seconds for the next try; a rules refusal drops them (they can never be accepted).
        if ((error as { code?: string }).code !== "permission-denied") {
          pending = { activeSec: pending.activeSec + batch.activeSec, idleSec: pending.idleSec + batch.idleSec, breakSec: pending.breakSec + batch.breakSec };
        }
      } finally {
        lastFlush = Date.now();
        flushing = false;
      }
    }

    const evaluate = () => {
      const now = Date.now();
      const state = computeState({ onBreak: !!breakRef.current, lastActivityMs: lastActivity.current, nowMs: now, idleMin: idleMinRef.current });
      if (pendingDate !== pktDateString(new Date(now))) {
        pendingDate = pktDateString(new Date(now));
        docKnown = null;
      }
      pending = accrue(pending, state, (now - lastTick) / 1000);
      lastTick = now;
      if (state === "idle" && idleSince === null) idleSince = lastActivity.current + idleMinRef.current * 60_000;
      if (state !== "idle") idleSince = null;
      setView((v) => (v.state === state && v.idleSinceMs === idleSince && v.openBreak?.id === breakRef.current?.id ? v : { state, idleSinceMs: idleSince, openBreak: breakRef.current }));
      if (connected) {
        publish(state);
        if (now - lastBeat >= BEAT_EVERY_MS) {
          lastBeat = now;
          void update(node, { lastBeat: rtdbTimestamp() }).catch(() => undefined);
        }
      }
      if (now - lastFlush >= FLUSH_EVERY_MS) void flush();
    };

    let lastEvent = 0;
    const activity = () => {
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastEvent > 1000) {
        lastEvent = now;
        evaluate(); // coming back from idle shows up immediately
      }
    };
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    const onVisibility = () => (document.visibilityState === "visible" ? activity() : void flush());
    document.addEventListener("visibilitychange", onVisibility);
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);

    const stopConnection = onValue(ref(rtdb, ".info/connected"), (snap) => {
      connected = snap.val() === true;
      if (!connected) return;
      published = null;
      // If the tab closes or the connection drops, the server marks us offline by itself.
      void onDisconnect(node).set({ state: "offline", since: rtdbTimestamp(), lastBeat: rtdbTimestamp() }).then(evaluate);
    });

    evaluate();
    const timer = setInterval(evaluate, TICK_MS);
    return () => {
      clearInterval(timer);
      stopConnection();
      events.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [db, rtdb, uid, name]);

  // A break starting or ending changes the status straight away, not at the next tick.
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [openBreak?.id]);

  return { ...view, openBreak };
}
