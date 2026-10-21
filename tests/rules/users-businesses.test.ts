import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const employee = (uid = "emp1", businessId = "b1") => env.authenticatedContext(uid, { role: "employee", businessId }).firestore();
const stranger = () => env.authenticatedContext("nobody").firestore(); // signed in but no role claim

const business = { name: "Alpha", color: "indigo", logoUrl: null, workStart: "09:00", workEnd: "18:00", workDays: [1, 2, 3], active: true };
const userDoc = (over: Record<string, unknown> = {}) => ({ role: "employee", name: "Ali", businessId: "b1", status: "active", photoUrl: null, ...over });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traxio",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "businesses/b1"), business);
    await setDoc(doc(db, "businesses/b2"), { ...business, name: "Beta" });
    await setDoc(doc(db, "users/emp1"), userDoc());
    await setDoc(doc(db, "users/emp2"), userDoc({ name: "Sara", businessId: "b2" }));
    await setDoc(doc(db, "users/admin1"), userDoc({ role: "admin", businessId: null }));
  });
});

describe("users", () => {
  it("anonymous users cannot read", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/emp1")));
  });
  it("an employee reads only their own profile", async () => {
    await assertSucceeds(getDoc(doc(employee(), "users/emp1")));
    await assertFails(getDoc(doc(employee(), "users/emp2")));
  });
  it("an employee cannot list users", async () => {
    await assertFails(getDocs(collection(employee(), "users")));
    await assertFails(getDocs(query(collection(employee(), "users"), where("businessId", "==", "b1"))));
  });
  it("admin reads and lists everyone", async () => {
    await assertSucceeds(getDoc(doc(admin(), "users/emp2")));
    await assertSucceeds(getDocs(collection(admin(), "users")));
  });
  it("a signed-in user without a role claim reads nothing", async () => {
    await assertFails(getDoc(doc(stranger(), "users/emp1")));
  });
  it("nobody creates or deletes profiles from the client, not even admin", async () => {
    await assertFails(setDoc(doc(admin(), "users/new"), userDoc()));
    await assertFails(deleteDoc(doc(admin(), "users/emp1")));
  });
  it("an employee cannot promote themselves or change their business", async () => {
    await assertFails(updateDoc(doc(employee(), "users/emp1"), { role: "admin" }));
    await assertFails(updateDoc(doc(employee(), "users/emp1"), { businessId: "b2" }));
    await assertFails(updateDoc(doc(employee(), "users/emp1"), { photoUrl: "https://x" }));
  });
  it("admin may only change photoUrl on a profile", async () => {
    await assertSucceeds(updateDoc(doc(admin(), "users/emp1"), { photoUrl: "https://example.com/p.png" }));
    await assertFails(updateDoc(doc(admin(), "users/emp1"), { status: "disabled" }));
    await assertFails(updateDoc(doc(admin(), "users/emp1"), { role: "admin" }));
    await assertFails(updateDoc(doc(admin(), "users/emp1"), { photoUrl: 42 }));
  });
});

describe("businesses", () => {
  it("an employee reads only their own business", async () => {
    await assertSucceeds(getDoc(doc(employee(), "businesses/b1")));
    await assertFails(getDoc(doc(employee(), "businesses/b2")));
    await assertFails(getDocs(collection(employee(), "businesses")));
  });
  it("admin creates, updates and deletes", async () => {
    await assertSucceeds(setDoc(doc(admin(), "businesses/b3"), business));
    await assertSucceeds(updateDoc(doc(admin(), "businesses/b3"), { name: "Gamma" }));
    await assertSucceeds(deleteDoc(doc(admin(), "businesses/b3")));
  });
  it("admin writes must be well-formed", async () => {
    await assertFails(setDoc(doc(admin(), "businesses/bad"), { ...business, name: "x" }));
    await assertFails(setDoc(doc(admin(), "businesses/bad"), { ...business, workDays: [] }));
    await assertFails(setDoc(doc(admin(), "businesses/bad"), { ...business, active: "yes" }));
  });
  it("employees cannot write businesses", async () => {
    await assertFails(updateDoc(doc(employee(), "businesses/b1"), { name: "Hijacked" }));
    await assertFails(setDoc(doc(employee(), "businesses/b9"), business));
    await assertFails(deleteDoc(doc(employee(), "businesses/b1")));
  });
});

describe("collections not opened yet", () => {
  it("stay denied for admin too", async () => {
    await assertFails(getDoc(doc(admin(), "tasks/t1")));
    await assertFails(setDoc(doc(admin(), "auditLogs/a1"), { x: 1 }));
  });
});
