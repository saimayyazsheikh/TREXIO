import { describe, expect, it } from "vitest";
import { MAX_TICK_SEC, STALE_BEAT_MS, accrue, breakSecondsInDay, computeState, effectiveStatus, formatDuration, statusLabel, type PresenceNode } from "@/lib/domain/presence";

const MIN = 60_000;

describe("computeState", () => {
  const base = { onBreak: false, lastActivityMs: 1_000_000, nowMs: 1_000_000, idleMin: 5 };
  it("is online while there was activity within the threshold, idle after it", () => {
    expect(computeState({ ...base, nowMs: base.lastActivityMs + 4 * MIN + 59_000 })).toBe("online");
    expect(computeState({ ...base, nowMs: base.lastActivityMs + 5 * MIN })).toBe("idle");
    expect(computeState({ ...base, nowMs: base.lastActivityMs + 60 * MIN })).toBe("idle");
  });
  it("a break always wins over idle", () => {
    expect(computeState({ ...base, onBreak: true, nowMs: base.lastActivityMs + 90 * MIN })).toBe("break");
  });
  it("honours a custom threshold", () => {
    expect(computeState({ ...base, idleMin: 2, nowMs: base.lastActivityMs + 2 * MIN })).toBe("idle");
    expect(computeState({ ...base, idleMin: 10, nowMs: base.lastActivityMs + 9 * MIN })).toBe("online");
  });
});

describe("accrue", () => {
  const zero = { activeSec: 0, idleSec: 0, breakSec: 0 };
  it("puts seconds in the matching bucket, and break time is never idle time", () => {
    expect(accrue(zero, "online", 10)).toEqual({ activeSec: 10, idleSec: 0, breakSec: 0 });
    expect(accrue(zero, "idle", 10)).toEqual({ activeSec: 0, idleSec: 10, breakSec: 0 });
    expect(accrue(zero, "break", 10)).toEqual({ activeSec: 0, idleSec: 0, breakSec: 10 });
  });
  it("caps a single tick so a sleeping laptop can't bank hours, and ignores negatives", () => {
    expect(accrue(zero, "online", 3600).activeSec).toBe(MAX_TICK_SEC);
    expect(accrue(zero, "online", -5).activeSec).toBe(0);
    expect(accrue(zero, "online", 9.6).activeSec).toBe(10);
  });
});

describe("effectiveStatus and statusLabel", () => {
  const now = 10_000_000;
  const node = (over: Partial<PresenceNode> = {}): PresenceNode => ({ state: "online", since: now - 12 * MIN, lastBeat: now - 10_000, ...over });

  it("a missing, offline or stale node is Offline", () => {
    expect(effectiveStatus(null, now).state).toBe("offline");
    expect(effectiveStatus(node({ state: "offline" }), now).state).toBe("offline");
    expect(effectiveStatus(node({ lastBeat: now - STALE_BEAT_MS - 1 }), now).state).toBe("offline");
    expect(effectiveStatus(node({ lastBeat: now - STALE_BEAT_MS + 1 }), now).state).toBe("online");
  });
  it("labels each state the way the admin reads it", () => {
    expect(statusLabel(effectiveStatus(node(), now), now)).toBe("Online");
    expect(statusLabel(effectiveStatus(node({ state: "idle" }), now), now)).toBe("Idle 12m");
    expect(statusLabel(effectiveStatus(node({ state: "break", breakType: "namaz" }), now), now)).toBe("On break · Namaz");
    expect(statusLabel(effectiveStatus(node({ state: "break", breakType: null }), now), now)).toBe("On break · Other");
    expect(statusLabel(effectiveStatus(null, now), now)).toBe("Offline");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [45, "45s"],
    [60, "1m"],
    [725, "12m"],
    [3600, "1h 00m"],
    [3905, "1h 05m"],
    [-5, "0s"],
  ])("%i seconds -> %s", (sec, text) => expect(formatDuration(sec)).toBe(text));
});

describe("breakSecondsInDay", () => {
  const dayStart = 0;
  const dayEnd = 24 * 3600_000;
  const hour = 3600_000;
  it("adds up breaks that finished inside the day", () => {
    expect(breakSecondsInDay([{ startMs: 12 * hour, endMs: 12.5 * hour }, { startMs: 15 * hour, endMs: 15.25 * hour }], dayStart, dayEnd, 20 * hour)).toBe(2700);
  });
  it("counts an unfinished break up to now, or to the end of its day", () => {
    expect(breakSecondsInDay([{ startMs: 12 * hour, endMs: null }], dayStart, dayEnd, 12.5 * hour)).toBe(1800);
    expect(breakSecondsInDay([{ startMs: 23 * hour, endMs: null }], dayStart, dayEnd, 30 * hour)).toBe(3600);
  });
  it("clips breaks that cross midnight and ignores ones outside the day", () => {
    expect(breakSecondsInDay([{ startMs: 23.5 * hour, endMs: 25 * hour }], dayStart, dayEnd, 30 * hour)).toBe(1800);
    expect(breakSecondsInDay([{ startMs: -2 * hour, endMs: -1 * hour }], dayStart, dayEnd, 30 * hour)).toBe(0);
  });
});
