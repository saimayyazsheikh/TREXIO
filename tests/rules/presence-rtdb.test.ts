import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { get, ref, serverTimestamp, set, update } from "firebase/database";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).database();
const emp = (uid: string) => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).database();
const stranger = () => env.authenticatedContext("nobody").database();
const anon = () => env.unauthenticatedContext().database();

const node = (over: Record<string, unknown> = {}) => ({ state: "online", since: serverTimestamp(), lastBeat: serverTimestamp(), ...over });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traxio",
    database: { rules: readFileSync("database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearDatabase());

describe("live presence (Realtime Database)", () => {
  it("an employee writes their own status with server times, then keeps it alive with heartbeats", async () => {
    await assertSucceeds(set(ref(emp("ali"), "presence/ali"), node()));
    await assertSucceeds(update(ref(emp("ali"), "presence/ali"), { lastBeat: serverTimestamp() }));
    await assertSucceeds(set(ref(emp("ali"), "presence/ali"), node({ state: "break", breakType: "namaz", breakNote: "Zuhr" })));
    await assertSucceeds(set(ref(emp("ali"), "presence/ali"), node({ state: "offline" })));
  });
  it("not someone else's node, and not without the employee role", async () => {
    await assertFails(set(ref(emp("ali"), "presence/sara"), node()));
    await assertFails(set(ref(stranger(), "presence/nobody"), node()));
    await assertFails(set(ref(anon(), "presence/ali"), node()));
    await assertFails(set(ref(admin(), "presence/ali"), node()));
  });
  it("can't fake the clock: times must be the server's", async () => {
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ lastBeat: Date.now() - 60_000 })));
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ lastBeat: Date.now() })));
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ since: Date.now() + 3_600_000 })));
  });
  it("rejects unknown states, bad break types, oversized notes and extra fields", async () => {
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ state: "away" })));
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ state: "break", breakType: "nap" })));
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ state: "break", breakType: "other", breakNote: "x".repeat(201) })));
    await assertFails(set(ref(emp("ali"), "presence/ali"), node({ isAdmin: true })));
    await assertFails(set(ref(emp("ali"), "presence/ali"), { state: "online" }));
  });
  it("only the admin reads the board", async () => {
    await set(ref(emp("ali"), "presence/ali"), node());
    await assertSucceeds(get(ref(admin(), "presence")));
    await assertSucceeds(get(ref(admin(), "presence/ali")));
    await assertFails(get(ref(emp("ali"), "presence/ali")));
    await assertFails(get(ref(emp("ali"), "presence")));
    await assertFails(get(ref(stranger(), "presence")));
    await assertFails(get(ref(anon(), "presence")));
  });
  it("nothing outside presence is readable or writable", async () => {
    await assertFails(set(ref(emp("ali"), "other/ali"), { x: 1 }));
    await assertFails(get(ref(admin(), "other")));
  });
});
