import { beforeEach, describe, expect, it } from "vitest";
import { createEmployee, resetEmployeePassword, setEmployeeStatus, updateEmployee, type Deps } from "@/lib/server/employees";
import { ServiceError } from "@/lib/server/service-error";
import type { UserDoc } from "@/types/models";

type Calls = string[];

function makeDeps(opts: { failStoreCreate?: boolean; emailTaken?: boolean; employees?: number } = {}) {
  const calls: Calls = [];
  const users = new Map<string, Pick<UserDoc, "role" | "businessId" | "status">>();
  const created: Record<string, unknown>[] = [];
  const deps: Deps = {
    org: { id: "org1234567890", code: "acme" },
    auth: {
      async createUser(p) {
        if (opts.emailTaken) throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
        calls.push(`auth.create:${p.email}`);
        return { uid: "u1" };
      },
      async updateUser(uid, p) {
        calls.push(`auth.update:${uid}:${JSON.stringify(p)}`);
      },
      async deleteUser(uid) {
        calls.push(`auth.delete:${uid}`);
      },
      async setCustomUserClaims(uid, claims) {
        calls.push(`auth.claims:${uid}:${claims.role}:${claims.orgId}:${claims.businessId}`);
      },
      async revokeRefreshTokens(uid) {
        calls.push(`auth.revoke:${uid}`);
      },
    },
    store: {
      async countEmployees() {
        return opts.employees ?? 0;
      },
      async businessExists(id) {
        return id === "b1" || id === "b2";
      },
      async getUser(uid) {
        return users.get(uid) ?? null;
      },
      async createUser(uid, data) {
        if (opts.failStoreCreate) throw new Error("firestore down");
        created.push({ uid, ...data });
        users.set(uid, { role: data.role, businessId: data.businessId, status: data.status });
      },
      async updateUser(uid, data) {
        calls.push(`store.update:${uid}:${JSON.stringify(data)}`);
      },
    },
  };
  return { deps, calls, users, created };
}

const input = {
  name: "Ali Khan", username: "ali", password: "longenough", businessId: "b1",
  contactEmail: null, phone: "+923001234567", designation: "Operator", workStart: null, workEnd: null,
};
const update = { name: "Ali K", contactEmail: null, phone: null, businessId: "b1", designation: "", workStart: null, workEnd: null };

describe("createEmployee", () => {
  it("creates login with synthetic email, claims and profile", async () => {
    const { deps, calls, created } = makeDeps();
    await expect(createEmployee(deps, input)).resolves.toEqual({ uid: "u1" });
    expect(calls).toContain("auth.create:ali@acme.traxio.app");
    expect(calls).toContain("auth.claims:u1:employee:org1234567890:b1");
    expect(created[0]).toMatchObject({ role: "employee", status: "active", email: "ali@acme.traxio.app", businessId: "b1" });
  });

  it("stops at the workspace team limit before creating anything", async () => {
    const { deps, calls } = makeDeps({ employees: 25 });
    await expect(createEmployee(deps, input)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("up to 25") });
    expect(calls).toHaveLength(0);
    const { deps: roomy } = makeDeps({ employees: 24 });
    await expect(createEmployee(roomy, input)).resolves.toEqual({ uid: "u1" });
  });

  it("rejects an unknown business before creating anything", async () => {
    const { deps, calls } = makeDeps();
    await expect(createEmployee(deps, { ...input, businessId: "nope" })).rejects.toBeInstanceOf(ServiceError);
    expect(calls).toHaveLength(0);
  });

  it("reports a taken username as a 409", async () => {
    const { deps } = makeDeps({ emailTaken: true });
    await expect(createEmployee(deps, input)).rejects.toMatchObject({ status: 409 });
  });

  it("rolls back the login when the profile write fails", async () => {
    const { deps, calls } = makeDeps({ failStoreCreate: true });
    await expect(createEmployee(deps, input)).rejects.toThrow("firestore down");
    expect(calls).toContain("auth.delete:u1");
  });
});

describe("existing employee operations", () => {
  let ctx: ReturnType<typeof makeDeps>;
  beforeEach(async () => {
    ctx = makeDeps();
    await createEmployee(ctx.deps, input);
    ctx.calls.length = 0;
    ctx.users.set("admin1", { role: "admin", businessId: null, status: "active" });
  });

  it("refuses to touch unknown users and admins", async () => {
    await expect(updateEmployee(ctx.deps, "ghost", update)).rejects.toMatchObject({ status: 404 });
    await expect(setEmployeeStatus(ctx.deps, "admin1", "disabled")).rejects.toMatchObject({ status: 404 });
    await expect(resetEmployeePassword(ctx.deps, "admin1", "newpassword1")).rejects.toMatchObject({ status: 404 });
  });

  it("only rewrites claims and revokes tokens when the business changes", async () => {
    await updateEmployee(ctx.deps, "u1", update);
    expect(ctx.calls.some((c) => c.startsWith("auth.claims"))).toBe(false);
    ctx.calls.length = 0;
    await updateEmployee(ctx.deps, "u1", { ...update, businessId: "b2" });
    expect(ctx.calls).toContain("auth.claims:u1:employee:org1234567890:b2");
    expect(ctx.calls).toContain("auth.revoke:u1");
  });

  it("disabling blocks the login and ends sessions", async () => {
    await setEmployeeStatus(ctx.deps, "u1", "disabled");
    expect(ctx.calls).toContain('auth.update:u1:{"disabled":true}');
    expect(ctx.calls).toContain("auth.revoke:u1");
    expect(ctx.calls.some((c) => c.includes('"status":"disabled"'))).toBe(true);
  });

  it("password reset revokes existing sessions", async () => {
    await resetEmployeePassword(ctx.deps, "u1", "newpassword1");
    expect(ctx.calls).toContain('auth.update:u1:{"password":"newpassword1"}');
    expect(ctx.calls).toContain("auth.revoke:u1");
  });
});
