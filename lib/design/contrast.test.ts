import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

/** Parses `--name: #hex;` declarations from one top-level block of globals.css. */
function readTokens(selector: string): Record<string, string> {
  const css = readFileSync("app/globals.css", "utf8");
  const start = css.indexOf(`\n${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2];
  return tokens;
}

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const blend = (fg: RGB, bg: RGB, alpha: number): RGB => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as RGB;

function luminance([r, g, b]: RGB): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = { light: readTokens(":root"), dark: readTokens(".dark") } as const;
const SEMANTIC = [
  "status-todo", "status-progress", "status-review", "status-done", "status-blocked",
  "priority-high", "priority-medium", "priority-low", "success", "warning", "danger", "info", "accent",
  "biz-indigo", "biz-violet", "biz-pink", "biz-rose", "biz-amber", "biz-emerald", "biz-teal", "biz-sky",
];

describe.each(Object.entries(themes))("%s theme contrast (WCAG 2.2 AA)", (_name, t) => {
  const bg = toRgb(t["background"]);
  const surface = toRgb(t["surface-solid"]);
  const raised = toRgb(t["surface-raised"]);

  it("body and muted text >= 4.5:1 on background, surface and raised surface", () => {
    for (const base of [bg, surface, raised]) {
      expect(ratio(toRgb(t["foreground"]), base)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(toRgb(t["muted"]), base)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("brand text and focus ring are visible on surfaces", () => {
    expect(ratio(toRgb(t["brand-text"]), surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(toRgb(t["ring"]), surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(toRgb(t["ring"]), bg)).toBeGreaterThanOrEqual(3);
  });

  it("text on the primary button, on the soft brand fill, and white on the danger button >= 4.5:1", () => {
    const white: RGB = [255, 255, 255];
    expect(ratio(toRgb(t["brand-fg"]), toRgb(t["brand"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(toRgb(t["brand-fg"]), toRgb(t["brand-hover"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(toRgb(t["brand-text"]), toRgb(t["brand-soft"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(white, toRgb(t["danger-solid"]))).toBeGreaterThanOrEqual(4.5);
  });

  it("form control borders >= 3:1 against the surface", () => {
    expect(ratio(toRgb(t["input"]), surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(SEMANTIC)("%s text >= 4.5:1 on plain and 15%%-tinted surface", (name) => {
    const fg = toRgb(t[name]);
    expect(ratio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(fg, blend(fg, surface, 0.15))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(fg, blend(fg, bg, 0.15))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("side panel", () => {
  it("mint and sage text read on every stop of the forest gradient and on the dark-mode ink", () => {
    for (const bgHex of ["#163832", "#0b2b26", "#051f20"])
      for (const fg of ["#daf1de", "#8eb69b"]) expect(ratio(toRgb(fg), toRgb(bgHex))).toBeGreaterThanOrEqual(4.5);
  });
});
