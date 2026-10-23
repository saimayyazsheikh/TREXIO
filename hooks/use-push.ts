"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { emulatorsEnabled } from "@/lib/env";

const KEY = "traxio.pushToken";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export type PushState = "unsupported" | "blocked" | "off" | "on";

/** Browser push for this device. Needs the VAPID key and a real Firebase project; hidden under the emulators. */
export function usePush() {
  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  useEffect(() => {
    if (emulatorsEnabled() || !vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return;
    setState(Notification.permission === "denied" ? "blocked" : Notification.permission === "granted" && read() ? "on" : "off");
  }, [vapidKey]);

  /** Must be called from a click: browsers only show the permission prompt after a user gesture. */
  const enable = useCallback(async (): Promise<string | null> => {
    if (!vapidKey) return "Push isn't set up yet.";
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return permission === "denied" ? "Notifications are blocked for this site in your browser settings." : null;
      }
      const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
      if (!(await isSupported())) {
        setState("unsupported");
        return "This browser can't receive push notifications.";
      }
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const token = await getToken(getMessaging(getFirebase().app), { vapidKey, serviceWorkerRegistration: registration });
      if (!token) return "Couldn't turn notifications on. Try again.";
      await apiFetch("/api/me/push-token", "POST", { action: "add", token });
      localStorage.setItem(KEY, token);
      setState("on");
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Couldn't turn notifications on. Try again.";
    } finally {
      setBusy(false);
    }
  }, [vapidKey]);

  const disable = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const token = read();
      if (token) await apiFetch("/api/me/push-token", "POST", { action: "remove", token });
      const { getMessaging, deleteToken } = await import("firebase/messaging");
      await deleteToken(getMessaging(getFirebase().app)).catch(() => undefined);
      localStorage.removeItem(KEY);
      setState("off");
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Couldn't turn notifications off. Try again.";
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}
