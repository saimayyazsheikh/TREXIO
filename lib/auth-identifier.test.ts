import { describe, expect, it } from "vitest";
import { employeeEmail, identifierToEmail } from "@/lib/auth-identifier";

describe("employeeEmail", () => {
  it("puts the workspace in the email so every workspace has its own namespace", () => {
    expect(employeeEmail("  Ali.Khan ", "Acme-Traders")).toBe("ali.khan@acme-traders.traxio.app");
    expect(employeeEmail("ali", "shop-a")).not.toBe(employeeEmail("ali", "shop-b"));
  });
});

describe("identifierToEmail", () => {
  it("maps a username plus workspace code to the synthetic email", () => {
    expect(identifierToEmail("  Ali.Khan ", " Acme-Traders ")).toBe("ali.khan@acme-traders.traxio.app");
  });
  it("keeps a real email, lower-cased, whatever the code says", () => {
    expect(identifierToEmail("Boss@Example.com")).toBe("boss@example.com");
    expect(identifierToEmail("Boss@Example.com", "acme")).toBe("boss@example.com");
  });
  it("needs a workspace code for a plain username", () => {
    expect(identifierToEmail("ali")).toBeNull();
    expect(identifierToEmail("ali", "   ")).toBeNull();
    expect(identifierToEmail("   ", "acme")).toBeNull();
  });
});
