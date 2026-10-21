import { describe, expect, it } from "vitest";
import { generatePassword } from "@/lib/password";
import { passwordSchema } from "@/lib/domain/schemas";

describe("generatePassword", () => {
  it("has the requested length and passes the password rules", () => {
    const p = generatePassword(14);
    expect(p).toHaveLength(14);
    expect(passwordSchema.safeParse(p).success).toBe(true);
  });
  it("avoids look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(generatePassword(32)).not.toMatch(/[0OlI1]/);
  });
  it("is different each time", () => {
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBe(20);
  });
});
