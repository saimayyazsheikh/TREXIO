export type PresenceState = "online" | "idle" | "break" | "offline";

/** Minutes without mouse, keyboard, touch or scroll inside Traxio before someone counts as idle. */
export const DEFAULT_IDLE_MIN = 5;
/**
 * Longest stretch one clock tick may add, so a sleeping laptop doesn't bank hours of "active" time. A tab in the background
 * is only woken about once a minute by the browser, so a tick must be allowed to cover that minute.
 */
export const MAX_TICK_SEC = 90;
/** A heartbeat older than this means the tab is gone, even if the browser never said goodbye. */
export const STALE_BEAT_MS = 3 * 60 * 1000;

export const BREAK_TYPES = ["namaz", "lunch", "other"] as const;
export type BreakType = (typeof BREAK_TYPES)[number];
export const BREAK_LABEL: Record<BreakType, string> = { namaz: "Namaz", lunch: "Lunch", other: "Other" };

/**
 * What the signed-in employee currently is. A break overrides everything.
 *
 * - With the browser's whole-computer idle detection allowed (`system`), idle means the computer itself is unused or locked,
 *   whichever window is in front.
 * - Without it, a tab in the background counts as active (the person is working in something else), and idle means Traxio is
 *   the window in front and nothing has moved for `idleMin` minutes.
 */
export function computeState(o: {
  onBreak: boolean;
  lastActivityMs: number;
  nowMs: number;
  idleMin: number;
  tabVisible?: boolean;
  system?: { idle: boolean } | null;
}): "online" | "idle" | "break" {
  if (o.onBreak) return "break";
  if (o.system) return o.system.idle ? "idle" : "online";
  if (o.tabVisible === false) return "online";
  return o.nowMs - o.lastActivityMs >= o.idleMin * 60_000 ? "idle" : "online";
}

export type Totals = { activeSec: number; idleSec: number; breakSec: number };

/** Adds elapsed seconds to the right bucket. Time on a break is never counted as idle. */
export function accrue(totals: Totals, state: "online" | "idle" | "break", seconds: number): Totals {
  const s = Math.max(0, Math.min(Math.round(seconds), MAX_TICK_SEC));
  if (state === "online") return { ...totals, activeSec: totals.activeSec + s };
  if (state === "idle") return { ...totals, idleSec: totals.idleSec + s };
  return { ...totals, breakSec: totals.breakSec + s };
}

/** The shape stored in the Realtime Database at presence/<uid>. Times are epoch milliseconds. */
export type PresenceNode = { state: PresenceState; since: number; lastBeat: number; breakType?: BreakType | null; breakNote?: string | null };

export type PresenceStatus = { state: PresenceState; sinceMs: number | null; breakType: BreakType | null };

/** What the admin should see: a missing, offline or stale node is Offline. */
export function effectiveStatus(node: PresenceNode | null | undefined, nowMs: number): PresenceStatus {
  if (!node || node.state === "offline" || nowMs - node.lastBeat > STALE_BEAT_MS) return { state: "offline", sinceMs: node?.since ?? null, breakType: null };
  return { state: node.state, sinceMs: node.since, breakType: node.state === "break" ? (node.breakType ?? "other") : null };
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/** Chip text: "Online", "Idle 12m", "On break · Namaz", "Offline". */
export function statusLabel(s: PresenceStatus, nowMs: number): string {
  switch (s.state) {
    case "online":
      return "Online";
    case "idle":
      return `Idle ${formatDuration(s.sinceMs ? (nowMs - s.sinceMs) / 1000 : 0)}`;
    case "break":
      return `On break · ${BREAK_LABEL[s.breakType ?? "other"]}`;
    default:
      return "Offline";
  }
}

/** Seconds of break inside [dayStart, dayEnd). An unfinished break counts up to now (or the day's end). */
export function breakSecondsInDay(breaks: { startMs: number; endMs: number | null }[], dayStartMs: number, dayEndMs: number, nowMs: number): number {
  let total = 0;
  for (const b of breaks) {
    const from = Math.max(b.startMs, dayStartMs);
    const to = Math.min(b.endMs ?? nowMs, dayEndMs);
    if (to > from) total += (to - from) / 1000;
  }
  return Math.round(total);
}
