import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin", orgId: "o1" }).firestore();
const emp = () => env.authenticatedContext("ali", { role: "employee", orgId: "o1", businessId: "b1" }).firestore();
const otherAdmin = () => env.authenticatedContext("admin2", { role: "admin", orgId: "o2" }).firestore();

const entry = (over: Record<string, unknown> = {}) => ({ title: "Buy paint", note: "Ask Ahmed first", remindOn: null, createdAt: serverTimestamp(), ...over });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-traxio", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "orgs/o1/dumpTasks/d1"), { title: "Fix the sign", note: "", remindOn: "2026-12-01", createdAt: Timestamp.fromMillis(1_700_000_000_000) });
  });
});

describe("dump tasks", () => {
  it("are the admin's alone: employees and other workspaces see nothing", async () => {
    await assertSucceeds(getDoc(doc(admin(), "orgs/o1/dumpTasks/d1")));
    await assertSucceeds(getDocs(collection(admin(), "orgs/o1/dumpTasks")));
    await assertFails(getDoc(doc(emp(), "orgs/o1/dumpTasks/d1")));
    await assertFails(getDocs(collection(emp(), "orgs/o1/dumpTasks")));
    await assertFails(getDoc(doc(otherAdmin(), "orgs/o1/dumpTasks/d1")));
  });

  it("the admin adds, edits and removes them", async () => {
    await assertSucceeds(setDoc(doc(admin(), "orgs/o1/dumpTasks/new1"), entry()));
    await assertSucceeds(setDoc(doc(admin(), "orgs/o1/dumpTasks/new2"), entry({ remindOn: "2026-11-20" })));
    await assertSucceeds(updateDoc(doc(admin(), "orgs/o1/dumpTasks/d1"), { title: "Fix the shop sign", remindOn: null }));
    await assertSucceeds(deleteDoc(doc(admin(), "orgs/o1/dumpTasks/d1")));
  });

  it("refuse an employee, a bad title, a bad day, extra fields, and rewriting when it was added", async () => {
    await assertFails(setDoc(doc(emp(), "orgs/o1/dumpTasks/x"), entry()));
    await assertFails(deleteDoc(doc(emp(), "orgs/o1/dumpTasks/d1")));
    await assertFails(setDoc(doc(admin(), "orgs/o1/dumpTasks/x"), entry({ title: "a" })));
    await assertFails(setDoc(doc(admin(), "orgs/o1/dumpTasks/x"), entry({ title: "x".repeat(121) })));
    await assertFails(setDoc(doc(admin(), "orgs/o1/dumpTasks/x"), entry({ remindOn: "next week" })));
    await assertFails(setDoc(doc(admin(), "orgs/o1/dumpTasks/x"), entry({ assigneeIds: ["ali"] })));
    await assertFails(setDoc(doc(admin(), "orgs/o1/dumpTasks/x"), entry({ createdAt: Timestamp.fromMillis(5) })));
    await assertFails(updateDoc(doc(admin(), "orgs/o1/dumpTasks/d1"), { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(admin(), "orgs/o1/dumpTasks/d1"), { note: "x".repeat(1001) }));
  });
});
