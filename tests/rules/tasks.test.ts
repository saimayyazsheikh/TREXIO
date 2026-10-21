import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const employee = (uid: string) => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).firestore();
const stranger = () => env.authenticatedContext("nobody").firestore();

const task = (assigneeIds: string[]) => ({ title: "Count stock", status: "todo", assigneeIds, kind: "oneoff", date: "2026-10-21", businessId: "b1" });

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
    await setDoc(doc(db, "tasks/t_ali"), task(["ali"]));
    await setDoc(doc(db, "tasks/t_sara"), task(["sara"]));
    await setDoc(doc(db, "tasks/t_both"), task(["ali", "sara"]));
    await setDoc(doc(db, "taskTemplates/tpl_ali"), { employeeId: "ali", title: "Server check" });
    await setDoc(doc(db, "taskTemplates/tpl_sara"), { employeeId: "sara", title: "Cash up" });
    await setDoc(doc(db, "auditLogs/a1"), { action: "task.create" });
    await setDoc(doc(db, "activity/x1"), { text: "Boss assigned something" });
  });
});

describe("tasks", () => {
  it("an employee reads tasks assigned to them, including shared ones, but not others'", async () => {
    await assertSucceeds(getDoc(doc(employee("ali"), "tasks/t_ali")));
    await assertSucceeds(getDoc(doc(employee("ali"), "tasks/t_both")));
    await assertFails(getDoc(doc(employee("ali"), "tasks/t_sara")));
  });
  it("an employee's own-tasks queries (the dashboard queries) work, a whole-collection query does not", async () => {
    const db = employee("ali");
    await assertSucceeds(getDocs(query(collection(db, "tasks"), where("assigneeIds", "array-contains", "ali"), where("date", "==", "2026-10-21"))));
    await assertSucceeds(getDocs(query(collection(db, "tasks"), where("assigneeIds", "array-contains", "ali"), where("kind", "==", "oneoff"), where("date", "<", "2026-10-21"), orderBy("date", "desc"))));
    await assertFails(getDocs(collection(db, "tasks")));
    await assertFails(getDocs(query(collection(db, "tasks"), where("assigneeIds", "array-contains", "sara"))));
  });
  it("admin reads everything", async () => {
    await assertSucceeds(getDoc(doc(admin(), "tasks/t_sara")));
    await assertSucceeds(getDocs(collection(admin(), "tasks")));
  });
  it("a signed-in user with no role reads nothing", async () => {
    await assertFails(getDoc(doc(stranger(), "tasks/t_ali")));
  });
  it("nobody writes tasks from the client: not employees, not even admin", async () => {
    await assertFails(updateDoc(doc(employee("ali"), "tasks/t_ali"), { status: "completed" }));
    await assertFails(updateDoc(doc(employee("ali"), "tasks/t_ali"), { subtasks: [] }));
    await assertFails(setDoc(doc(employee("ali"), "tasks/new"), task(["ali"])));
    await assertFails(deleteDoc(doc(employee("ali"), "tasks/t_ali")));
    await assertFails(updateDoc(doc(admin(), "tasks/t_ali"), { status: "completed" }));
    await assertFails(setDoc(doc(admin(), "tasks/new"), task(["ali"])));
    await assertFails(deleteDoc(doc(admin(), "tasks/t_ali")));
  });
});

describe("taskTemplates", () => {
  it("an employee reads only their own routines", async () => {
    await assertSucceeds(getDoc(doc(employee("ali"), "taskTemplates/tpl_ali")));
    await assertFails(getDoc(doc(employee("ali"), "taskTemplates/tpl_sara")));
    await assertSucceeds(getDocs(query(collection(employee("ali"), "taskTemplates"), where("employeeId", "==", "ali"))));
    await assertFails(getDocs(collection(employee("ali"), "taskTemplates")));
  });
  it("admin reads all but nobody writes from the client", async () => {
    await assertSucceeds(getDocs(collection(admin(), "taskTemplates")));
    await assertFails(setDoc(doc(admin(), "taskTemplates/new"), { employeeId: "ali" }));
    await assertFails(updateDoc(doc(employee("ali"), "taskTemplates/tpl_ali"), { title: "Free time" }));
    await assertFails(deleteDoc(doc(admin(), "taskTemplates/tpl_ali")));
  });
});

describe("auditLogs and activity", () => {
  it("only the admin can read", async () => {
    await assertSucceeds(getDoc(doc(admin(), "auditLogs/a1")));
    await assertSucceeds(getDoc(doc(admin(), "activity/x1")));
    await assertFails(getDoc(doc(employee("ali"), "auditLogs/a1")));
    await assertFails(getDoc(doc(employee("ali"), "activity/x1")));
  });
  it("is append-only to everyone: clients can never write, edit or delete a trail", async () => {
    for (const db of [admin(), employee("ali")]) {
      await assertFails(addDoc(collection(db, "auditLogs"), { action: "forged" }));
      await assertFails(updateDoc(doc(db, "auditLogs/a1"), { action: "edited" }));
      await assertFails(deleteDoc(doc(db, "auditLogs/a1")));
      await assertFails(addDoc(collection(db, "activity"), { text: "forged" }));
      await assertFails(deleteDoc(doc(db, "activity/x1")));
    }
  });
});
