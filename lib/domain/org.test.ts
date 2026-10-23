import { describe, expect, it } from "vitest";
import { codeCandidates, suggestCode, workspaceCodeSchema } from "@/lib/domain/org";

describe("workspaceCodeSchema", () => {
  it("accepts friendly codes and lowercases them", () => {
    expect(workspaceCodeSchema.parse("  Acme-Traders ")).toBe("acme-traders");
    expect(workspaceCodeSchema.parse("a1b")).toBe("a1b");
  });
  it("rejects anything that wouldn't be a valid hostname label", () => {
    for (const bad of ["ab", "-acme", "acme-", "ac me", "acme.traders", "acme_traders", "a--b", "x".repeat(25), "", "acme@x"]) expect(workspaceCodeSchema.safeParse(bad).success, bad).toBe(false);
  });
  it("rejects reserved words", () => {
    for (const reserved of ["admin", "api", "www", "traxio", "login"]) expect(workspaceCodeSchema.safeParse(reserved).success, reserved).toBe(false);
  });
});

describe("suggestCode", () => {
  it("turns a name into a valid code", () => {
    expect(suggestCode("Acme Traders Ltd.")).toBe("acme-traders-ltd");
    expect(workspaceCodeSchema.safeParse(suggestCode("Café Ñandú & Sons!!")).success).toBe(true);
  });
  it("always gives something valid, even for names with no usable letters", () => {
    for (const name of ["", "!!", "اردو", "a"]) expect(workspaceCodeSchema.safeParse(suggestCode(name)).success, name).toBe(true);
  });
  it("cuts long names to the limit without a trailing dash", () => {
    const code = suggestCode("The Extraordinarily Long Business Name Company");
    expect(code.length).toBeLessThanOrEqual(24);
    expect(code.endsWith("-")).toBe(false);
  });
});

describe("codeCandidates", () => {
  it("offers the base, then numbered variants that stay valid and within 24 characters", () => {
    const list = codeCandidates("acme", 4);
    expect(list).toEqual(["acme", "acme-2", "acme-3", "acme-4"]);
    const long = codeCandidates("a".repeat(24), 3);
    for (const c of long) {
      expect(c.length).toBeLessThanOrEqual(24);
      expect(workspaceCodeSchema.safeParse(c).success, c).toBe(true);
    }
    expect(new Set(long).size).toBe(3);
  });
});
