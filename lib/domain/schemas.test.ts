import { describe, expect, it } from "vitest";
import { businessInputSchema, createEmployeeSchema, phoneSchema, usernameSchema, updateEmployeeSchema } from "@/lib/domain/schemas";

const business = { name: "Alpha Traders", color: "indigo", workStart: "09:00", workEnd: "18:00", workDays: [5, 1, 1, 3], active: true };

describe("businessInputSchema", () => {
  it("accepts valid input and normalises work days", () => {
    const parsed = businessInputSchema.parse(business);
    expect(parsed.workDays).toEqual([1, 3, 5]);
  });
  it("rejects closing before opening", () => {
    expect(businessInputSchema.safeParse({ ...business, workEnd: "08:00" }).success).toBe(false);
  });
  it("rejects colours outside the curated list", () => {
    expect(businessInputSchema.safeParse({ ...business, color: "#ff00ff" }).success).toBe(false);
  });
  it("requires at least one working day", () => {
    expect(businessInputSchema.safeParse({ ...business, workDays: [] }).success).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("lower-cases and accepts valid usernames", () => {
    expect(usernameSchema.parse(" Ali.Khan ")).toBe("ali.khan");
  });
  it.each(["ab", "has space", "UPPER$", "-start", "x".repeat(40)])("rejects %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("accepts E.164 and rejects local formats", () => {
    expect(phoneSchema.safeParse("+923001234567").success).toBe(true);
    expect(phoneSchema.safeParse("03001234567").success).toBe(false);
  });
});

describe("employee schemas", () => {
  const base = { name: "Ali Khan", username: "ali", password: "longenough", businessId: "b1", contactEmail: "", phone: "", designation: "", workStart: "", workEnd: "" };

  it("turns empty optional strings into null", () => {
    const parsed = createEmployeeSchema.parse(base);
    expect(parsed).toMatchObject({ contactEmail: null, phone: null, workStart: null, workEnd: null });
  });
  it("rejects short passwords", () => {
    expect(createEmployeeSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });
  it("requires both work times or neither", () => {
    expect(updateEmployeeSchema.safeParse({ ...base, workStart: "10:00" }).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ ...base, workStart: "10:00", workEnd: "09:00" }).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ ...base, workStart: "10:00", workEnd: "19:00" }).success).toBe(true);
  });
});
