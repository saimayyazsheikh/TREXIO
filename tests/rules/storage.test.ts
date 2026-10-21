import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).storage();
const employee = (uid = "emp1") => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).storage();
const stranger = () => env.authenticatedContext("nobody").storage();

const png = (bytes = 1024) => new Uint8Array(bytes);
const meta = { contentType: "image/png" };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traxio",
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env.cleanup());

describe("avatars", () => {
  it("owner and admin can upload an image; other employees cannot", async () => {
    await assertSucceeds(uploadBytes(ref(employee("emp1"), "avatars/emp1"), png(), meta));
    await assertSucceeds(uploadBytes(ref(admin(), "avatars/emp2"), png(), meta));
    await assertFails(uploadBytes(ref(employee("emp2"), "avatars/emp1"), png(), meta));
  });
  it("rejects non-images and files over 2 MB", async () => {
    await assertFails(uploadBytes(ref(admin(), "avatars/emp1"), png(), { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(admin(), "avatars/emp1"), png(2 * 1024 * 1024 + 1), meta));
  });
  it("team members can read avatars; signed-in users without a role cannot", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "avatars/emp1"), png(), meta);
    });
    await assertSucceeds(getBytes(ref(employee("emp9"), "avatars/emp1")));
    await assertFails(getBytes(ref(stranger(), "avatars/emp1")));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), "avatars/emp1")));
  });
  it("only the owner or admin can delete", async () => {
    await assertFails(deleteObject(ref(employee("emp2"), "avatars/emp1")));
    await assertSucceeds(deleteObject(ref(admin(), "avatars/emp1")));
  });
});

describe("logos", () => {
  it("only admin writes; employees read", async () => {
    await assertSucceeds(uploadBytes(ref(admin(), "logos/b1"), png(), meta));
    await assertFails(uploadBytes(ref(employee(), "logos/b1"), png(), meta));
    await assertSucceeds(getBytes(ref(employee(), "logos/b1")));
  });
});

describe("private user files", () => {
  it("owner and admin only", async () => {
    await assertSucceeds(uploadBytes(ref(employee("emp1"), "u/emp1/note.txt"), png(), { contentType: "text/plain" }));
    await assertSucceeds(getBytes(ref(employee("emp1"), "u/emp1/note.txt")));
    await assertSucceeds(getBytes(ref(admin(), "u/emp1/note.txt")));
    await assertFails(getBytes(ref(employee("emp2"), "u/emp1/note.txt")));
    await assertFails(uploadBytes(ref(employee("emp2"), "u/emp1/other.txt"), png(), { contentType: "text/plain" }));
  });
  it("enforces the 10 MB cap", async () => {
    await assertFails(uploadBytes(ref(employee("emp1"), "u/emp1/big.bin"), png(10 * 1024 * 1024 + 1), { contentType: "application/octet-stream" }));
  });
});

describe("everything else is denied", () => {
  it("rejects unknown paths even for admin", async () => {
    await assertFails(uploadBytes(ref(admin(), "random/file.png"), png(), meta));
  });
});
