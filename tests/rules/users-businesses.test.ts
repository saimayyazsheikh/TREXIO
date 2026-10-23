import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin", orgId: "o1" }).firestore();
const employee = (uid = "emp1", businessId = "b1") => env.authenticatedContext(uid, { role: "employee", orgId: "o1", businessId }).firestore();
const stranger = () => env.authenticatedContext("nobody").firestore(); // signed in but no role claim

const business = { name: "Alpha", color: "indigo", workStart: "09:00", workEnd: "18:00", workDays: [1, 2, 3], active: true };
const userDoc = (over: Record<string, unknown> = {}) => ({ role: "employee", name: "Ali", businessId: "b1", status: "active", ...over });

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
    await setDoc(doc(db, "orgs/o1/businesses/b1"), business);
    await setDoc(doc(db, "orgs/o1/businesses/b2"), { ...business, name: "Beta" });
    await setDoc(doc(db, "orgs/o1/users/emp1"), userDoc());
    await setDoc(doc(db, "orgs/o1/users/emp2"), userDoc({ name: "Sara", businessId: "b2" }));
    await setDoc(doc(db, "orgs/o1/users/admin1"), userDoc({ role: "admin", businessId: null }));
  });
});

describe("users", () => {
  it("anonymous users cannot read", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "orgs/o1/users/emp1")));
  });
  it("an employee reads only their own profile", async () => {
    await assertSucceeds(getDoc(doc(employee(), "orgs/o1/users/emp1")));
    await assertFails(getDoc(doc(employee(), "orgs/o1/users/emp2")));
  });
  it("an employee cannot list users", async () => {
    await assertFails(getDocs(collection(employee(), "orgs/o1/users")));
    await assertFails(getDocs(query(collection(employee(), "orgs/o1/users"), where("businessId", "==", "b1"))));
  });
  it("admin reads and lists everyone", async () => {
    await assertSucceeds(getDoc(doc(admin(), "orgs/o1/users/emp2")));
    await assertSucceeds(getDocs(collection(admin(), "orgs/o1/users")));
  });
  it("a signed-in user without a role claim reads nothing", async () => {
    await assertFails(getDoc(doc(stranger(), "orgs/o1/users/emp1")));
  });
  it("nobody creates or deletes profiles from the client, not even admin", async () => {
    await assertFails(setDoc(doc(admin(), "orgs/o1/users/new"), userDoc()));
    await assertFails(deleteDoc(doc(admin(), "orgs/o1/users/emp1")));
  });
  it("an employee cannot promote themselves or change their business", async () => {
    await assertFails(updateDoc(doc(employee(), "orgs/o1/users/emp1"), { role: "admin", orgId: "o1" }));
    await assertFails(updateDoc(doc(employee(), "orgs/o1/users/emp1"), { businessId: "b2" }));
    await assertFails(updateDoc(doc(employee(), "orgs/o1/users/emp1"), { name: "Someone else" }));
  });
  it("not even the admin edits a profile from the browser; only server routes do", async () => {
    await assertFails(updateDoc(doc(admin(), "orgs/o1/users/emp1"), { name: "Renamed" }));
    await assertFails(updateDoc(doc(admin(), "orgs/o1/users/emp1"), { status: "disabled" }));
    await assertFails(updateDoc(doc(admin(), "orgs/o1/users/emp1"), { role: "admin", orgId: "o1" }));
  });
});

describe("businesses", () => {
  it("an employee reads only their own business", async () => {
    await assertSucceeds(getDoc(doc(employee(), "orgs/o1/businesses/b1")));
    await assertFails(getDoc(doc(employee(), "orgs/o1/businesses/b2")));
    await assertFails(getDocs(collection(employee(), "orgs/o1/businesses")));
  });
  it("admin creates, updates and deletes", async () => {
    await assertSucceeds(setDoc(doc(admin(), "orgs/o1/businesses/b3"), business));
    await assertSucceeds(updateDoc(doc(admin(), "orgs/o1/businesses/b3"), { name: "Gamma" }));
    await assertSucceeds(deleteDoc(doc(admin(), "orgs/o1/businesses/b3")));
  });
  it("admin writes must be well-formed", async () => {
    await assertFails(setDoc(doc(admin(), "orgs/o1/businesses/bad"), { ...business, name: "x" }));
    await assertFails(setDoc(doc(admin(), "orgs/o1/businesses/bad"), { ...business, workDays: [] }));
    await assertFails(setDoc(doc(admin(), "orgs/o1/businesses/bad"), { ...business, active: "yes" }));
  });
  it("employees cannot write businesses", async () => {
    await assertFails(updateDoc(doc(employee(), "orgs/o1/businesses/b1"), { name: "Hijacked" }));
    await assertFails(setDoc(doc(employee(), "orgs/o1/businesses/b9"), business));
    await assertFails(deleteDoc(doc(employee(), "orgs/o1/businesses/b1")));
  });
});

describe("collections not opened yet", () => {
  it("stay denied for admin too", async () => {
    await assertFails(getDoc(doc(admin(), "orgs/o1/futureThings/s1")));
    await assertFails(setDoc(doc(admin(), "orgs/o1/whatsappLogs/w1"), { x: 1 }));
  });
});
