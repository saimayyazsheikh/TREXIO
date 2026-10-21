import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
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
    // Task-attachment rules read the task document to find its assignees.
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
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

describe("task attachments", () => {
  it("admin uploads; the assignee and admin read; other employees cannot", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tasks/t1"), { assigneeIds: ["emp1"] });
    });
    await assertSucceeds(uploadBytes(ref(admin(), "tasks/t1/brief.pdf"), png(), { contentType: "application/pdf" }));
    await assertSucceeds(getBytes(ref(employee("emp1"), "tasks/t1/brief.pdf")));
    await assertSucceeds(getBytes(ref(admin(), "tasks/t1/brief.pdf")));
    await assertFails(getBytes(ref(employee("emp2"), "tasks/t1/brief.pdf")));
    await assertFails(getBytes(ref(stranger(), "tasks/t1/brief.pdf")));
  });
  it("employees cannot upload or delete; files are capped at 10 MB", async () => {
    await assertFails(uploadBytes(ref(employee("emp1"), "tasks/t1/mine.pdf"), png(), { contentType: "application/pdf" }));
    await assertFails(deleteObject(ref(employee("emp1"), "tasks/t1/brief.pdf")));
    await assertFails(uploadBytes(ref(admin(), "tasks/t1/huge.bin"), png(10 * 1024 * 1024 + 1), { contentType: "application/octet-stream" }));
    await assertSucceeds(deleteObject(ref(admin(), "tasks/t1/brief.pdf")));
  });
});

describe("reminder attachments", () => {
  it("admin uploads; recipients and admin read; other employees can't", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "reminders/r1"), { toUids: ["emp1"] });
    });
    await assertSucceeds(uploadBytes(ref(admin(), "reminders/r1/brief.pdf"), png(), { contentType: "application/pdf" }));
    await assertSucceeds(getBytes(ref(employee("emp1"), "reminders/r1/brief.pdf")));
    await assertFails(getBytes(ref(employee("emp2"), "reminders/r1/brief.pdf")));
    await assertFails(uploadBytes(ref(employee("emp1"), "reminders/r1/mine.pdf"), png(), { contentType: "application/pdf" }));
  });
});

describe("chat files", () => {
  it("Everyone: any team member adds and reads; role-less users can't", async () => {
    await assertSucceeds(uploadBytes(ref(employee("emp1"), "chats/everyone/a.png"), png(), meta));
    await assertSucceeds(getBytes(ref(employee("emp2"), "chats/everyone/a.png")));
    await assertFails(getBytes(ref(stranger(), "chats/everyone/a.png")));
  });
  it("direct chats: only that employee and the admin", async () => {
    await assertSucceeds(uploadBytes(ref(employee("emp1"), "chats/dm_emp1/a.png"), png(), meta));
    await assertSucceeds(uploadBytes(ref(admin(), "chats/dm_emp1/b.png"), png(), meta));
    await assertSucceeds(getBytes(ref(employee("emp1"), "chats/dm_emp1/b.png")));
    await assertFails(getBytes(ref(employee("emp2"), "chats/dm_emp1/a.png")));
    await assertFails(uploadBytes(ref(employee("emp2"), "chats/dm_emp1/c.png"), png(), meta));
  });
  it("enforces the size cap and admin-only delete", async () => {
    await assertFails(uploadBytes(ref(employee("emp1"), "chats/everyone/big.bin"), png(10 * 1024 * 1024 + 1), { contentType: "application/octet-stream" }));
    await assertFails(deleteObject(ref(employee("emp1"), "chats/everyone/a.png")));
    await assertSucceeds(deleteObject(ref(admin(), "chats/everyone/a.png")));
  });
});

describe("everything else is denied", () => {
  it("rejects unknown paths even for admin", async () => {
    await assertFails(uploadBytes(ref(admin(), "random/file.png"), png(), meta));
  });
});
