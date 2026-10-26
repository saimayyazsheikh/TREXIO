/**
 * Whether the whole computer is in use, using the browser's own Idle Detection (Chrome and Edge). It tells a page only that
 * the keyboard and mouse have gone quiet, or that the screen is locked: never which apps or sites are open, and nothing
 * is recorded. It needs the person's permission, asked once.
 */
export type SystemIdleStatus = "unsupported" | "prompt" | "granted" | "denied";
export type SystemIdleSnapshot = { status: SystemIdleStatus; idle: boolean };

type Detector = {
  userState: "active" | "idle" | null;
  screenState: "locked" | "unlocked" | null;
  addEventListener(type: "change", listener: () => void): void;
  start(options: { threshold: number; signal?: AbortSignal }): Promise<void>;
};
type DetectorConstructor = { new (): Detector; requestPermission(): Promise<"granted" | "denied"> };

const constructor = () => (globalThis as { IdleDetector?: DetectorConstructor }).IdleDetector;
const MIN_THRESHOLD_MS = 60_000;

export const SERVER_SNAPSHOT: SystemIdleSnapshot = { status: "unsupported", idle: false };
let snapshot: SystemIdleSnapshot = SERVER_SNAPSHOT;
let started = false;
let running = false;
let thresholdMs = MIN_THRESHOLD_MS;
const listeners = new Set<() => void>();

function set(next: Partial<SystemIdleSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.status === snapshot.status && merged.idle === snapshot.idle) return;
  snapshot = merged;
  listeners.forEach((l) => l());
}

export const getSystemIdle = () => snapshot;
export function subscribeSystemIdle(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

async function begin() {
  const Detector = constructor();
  if (!Detector || running) return;
  try {
    const detector = new Detector();
    const read = () => set({ idle: detector.userState === "idle" || detector.screenState === "locked" });
    detector.addEventListener("change", read);
    await detector.start({ threshold: Math.max(MIN_THRESHOLD_MS, thresholdMs) });
    running = true;
    set({ status: "granted" });
    read();
  } catch {
    set({ status: "denied" });
  }
}

/** Looks at what the browser already allows. If the person said yes before, detection simply starts. */
export async function initSystemIdle(idleAfterMs: number) {
  thresholdMs = idleAfterMs;
  if (started || typeof window === "undefined") return;
  started = true;
  if (!constructor()) return set({ status: "unsupported" });
  let state: PermissionState = "prompt";
  try {
    state = (await navigator.permissions.query({ name: "idle-detection" as PermissionName })).state;
  } catch {
    /* the browser can't say: treat as not asked yet */
  }
  if (state === "granted") await begin();
  else set({ status: state === "denied" ? "denied" : "prompt" });
}

/** Asks the browser for permission (must be called from a click). Returns whether detection is now running. */
export async function enableSystemIdle(idleAfterMs: number): Promise<boolean> {
  const Detector = constructor();
  if (!Detector) return false;
  thresholdMs = idleAfterMs;
  try {
    if ((await Detector.requestPermission()) !== "granted") {
      set({ status: "denied" });
      return false;
    }
  } catch {
    set({ status: "denied" });
    return false;
  }
  await begin();
  return snapshot.status === "granted";
}
