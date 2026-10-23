import { beforeEach, describe, expect, it } from "vitest";
import { createWorkspace, type NewOwner, type WorkspaceDeps } from "@/lib/server/workspaces";

let taken: Set<string>;
let owners: Set<string>;
let created: { orgId: string; code: string; name: string; owner: { uid: string; name: string; email: string } }[];
let claims: { uid: string; role: string; orgId: string }[];
let failClaims: boolean;

const deps = (): WorkspaceDeps => ({
  auth: {
    setCustomUserClaims: async (uid, c) => {
      if (failClaims) throw new Error("auth down");
      claims.push({ uid, ...c });
    },
  },
  store: {
    newOrgId: () => "org1234567890abcdefgh",
    createWorkspace: async (w) => {
      if (owners.has(w.owner.uid)) return "owner-has-workspace";
      if (taken.has(w.code)) return "code-taken";
      taken.add(w.code);
      owners.add(w.owner.uid);
      created.push(w);
      return "ok";
    },
  },
});

const owner = (o: Partial<NewOwner> = {}): NewOwner => ({ uid: "u1", name: "Saim Sheikh", email: "saim@gmail.com", emailVerified: true, alreadyInWorkspace: false, ...o });

beforeEach(() => {
  taken = new Set();
  owners = new Set();
  created = [];
  claims = [];
  failClaims = false;
});

describe("createWorkspace", () => {
  it("makes the workspace, with the signer-in as its admin", async () => {
    const r = await createWorkspace(deps(), owner(), { name: "Acme Traders" });
    expect(r).toEqual({ orgId: "org1234567890abcdefgh", code: "acme-traders" });
    expect(created[0]).toMatchObject({ name: "Acme Traders", owner: { uid: "u1", name: "Saim Sheikh", email: "saim@gmail.com" } });
    expect(claims).toEqual([{ uid: "u1", role: "admin", orgId: "org1234567890abcdefgh" }]);
  });

  it("finds a free code when the obvious one is taken", async () => {
    taken = new Set(["acme", "acme-2"]);
    expect((await createWorkspace(deps(), owner(), { name: "Acme" })).code).toBe("acme-3");
  });

  it("uses the code the owner asked for, and refuses it if it is taken or invalid", async () => {
    expect((await createWorkspace(deps(), owner(), { name: "Acme", code: " Shop-One " })).code).toBe("shop-one");
    await expect(createWorkspace(deps(), owner({ uid: "u2" }), { name: "Other", code: "shop-one" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("already taken") });
    for (const bad of ["ab", "admin", "has space"]) await expect(createWorkspace(deps(), owner(), { name: "X Co", code: bad })).rejects.toMatchObject({ status: 400 });
  });

  it("only lets a verified account create one, and only once", async () => {
    await expect(createWorkspace(deps(), owner({ emailVerified: false }), { name: "Acme" })).rejects.toMatchObject({ status: 403 });
    await expect(createWorkspace(deps(), owner({ email: null }), { name: "Acme" })).rejects.toMatchObject({ status: 403 });
    await expect(createWorkspace(deps(), owner({ alreadyInWorkspace: true }), { name: "Acme" })).rejects.toMatchObject({ status: 409 });
    expect(created).toHaveLength(0);
    expect(claims).toHaveLength(0);
  });

  it("one workspace per person, even when their login token doesn't show it yet", async () => {
    await createWorkspace(deps(), owner(), { name: "Acme" });
    await expect(createWorkspace(deps(), owner(), { name: "Second Try" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("already have a workspace") });
    expect(created).toHaveLength(1);
    expect(claims).toHaveLength(1);
  });

  it("needs a sensible name", async () => {
    for (const name of ["", " ", "a", "x".repeat(61)]) await expect(createWorkspace(deps(), owner(), { name })).rejects.toMatchObject({ status: 400 });
    expect(created).toHaveLength(0);
  });

  it("falls back to the email name when Google gave no display name", async () => {
    await createWorkspace(deps(), owner({ name: "" }), { name: "Acme" });
    expect(created[0].owner.name).toBe("saim");
  });

  it("gives up cleanly when no code is free", async () => {
    taken = new Set(["acme", ...Array.from({ length: 7 }, (_, i) => `acme-${i + 2}`)]);
    await expect(createWorkspace(deps(), owner(), { name: "Acme" })).rejects.toMatchObject({ status: 409 });
    expect(claims).toHaveLength(0);
  });
});
