import { describe, expect, it } from "vitest";
import { isQuiet, pushTokensFor, quietHoursSchema } from "@/lib/domain/quiet-hours";
import { pktInstant } from "@/lib/time";

const at = (hhmm: string) => pktInstant("2026-11-18", hhmm);

describe("isQuiet", () => {
  it("is never quiet when nothing is set", () => {
    expect(isQuiet(at("03:00"), null)).toBe(false);
    expect(isQuiet(at("03:00"), undefined)).toBe(false);
  });

  it("handles a window inside one day", () => {
    const q = { from: "13:00", to: "14:00" };
    expect(isQuiet(at("12:59"), q)).toBe(false);
    expect(isQuiet(at("13:00"), q)).toBe(true);
    expect(isQuiet(at("13:59"), q)).toBe(true);
    expect(isQuiet(at("14:00"), q)).toBe(false);
  });

  it("handles a window that crosses midnight", () => {
    const q = { from: "22:00", to: "07:00" };
    expect(isQuiet(at("21:59"), q)).toBe(false);
    expect(isQuiet(at("22:00"), q)).toBe(true);
    expect(isQuiet(at("23:59"), q)).toBe(true);
    expect(isQuiet(at("00:00"), q)).toBe(true);
    expect(isQuiet(at("06:59"), q)).toBe(true);
    expect(isQuiet(at("07:00"), q)).toBe(false);
    expect(isQuiet(at("12:00"), q)).toBe(false);
  });

  it("ignores a window whose two times are the same", () => {
    expect(isQuiet(at("10:00"), { from: "10:00", to: "10:00" })).toBe(false);
  });
});

describe("pushTokensFor", () => {
  it("skips people in their quiet hours and keeps everyone else", () => {
    const users = [
      { fcmTokens: ["a1", "a2"], quietHours: { from: "22:00", to: "07:00" } },
      { fcmTokens: ["b1"], quietHours: null },
      { fcmTokens: ["c1"] },
      {},
    ];
    expect(pushTokensFor(users, at("23:00"))).toEqual(["b1", "c1"]);
    expect(pushTokensFor(users, at("10:00"))).toEqual(["a1", "a2", "b1", "c1"]);
  });
});

describe("quietHoursSchema", () => {
  it("needs valid, different times when switched on", () => {
    expect(quietHoursSchema.safeParse({ enabled: true, from: "22:00", to: "07:00" }).success).toBe(true);
    expect(quietHoursSchema.safeParse({ enabled: true, from: "22:00", to: "22:00" }).success).toBe(false);
    expect(quietHoursSchema.safeParse({ enabled: true, from: "25:00", to: "07:00" }).success).toBe(false);
    expect(quietHoursSchema.safeParse({ enabled: false, from: "22:00", to: "22:00" }).success).toBe(true);
  });
});
