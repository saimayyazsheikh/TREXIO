import { describe, expect, it } from "vitest";
import { identifierToEmail } from "@/lib/auth-identifier";

describe("identifierToEmail", () => {
  it("maps a username to the synthetic email", () => {
    expect(identifierToEmail("  Ali.Khan ")).toBe("ali.khan@traxio.app");
  });
  it("keeps a real email, lower-cased", () => {
    expect(identifierToEmail("Boss@Example.com")).toBe("boss@example.com");
  });
});
