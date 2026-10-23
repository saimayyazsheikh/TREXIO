import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { get, ref, set } from "firebase/database";
import { readFileSync } from "fs";

/**
 * Two customers, two workspaces (o1 and o2). Whatever one of them asks for, the other's data stays out of reach: reads,
 * lists, writes, deletes, collection-group queries and live presence, as admin or as employee.
 */
let env: RulesTestEnvironment;

const as = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims);
const admin1 = () => as("admin1", { role: "admin", orgId: "o1" }).firestore();
const emp1 = () => as("ali", { role: "employee", orgId: "o1", businessId: "b1" }).firestore();
const admin2 = () => as("admin2", { role: "admin", orgId: "o2" }).firestore();
const emp2 = () => as("omar", { role: "employee", orgId: "o2", businessId: "b9" }).firestore();
const noOrg = () => as("drifter", { role: "admin" }).firestore();
const noRole = () => as("nobody", { orgId: "o1" }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** Every collection a workspace owns, with a document that exists in o1. */
const OWNED: Record<string, Record<string, unknown>> = {
  users: { role: "employee", name: "Ali", businessId: "b1", status: "active" },
  businesses: { name: "Alpha", active: true, workDays: [1], workStart: "09:00", workEnd: "18:00" },
  tasks: { title: "Count stock", assigneeIds: ["ali"], status: "todo", date: "2026-10-21" },
  taskTemplates: { employeeId: "ali", title: "Routine" },
  auditLogs: { action: "task.create" },
  activity: { text: "Boss assigned something" },
  reminders: { toUids: ["ali"], body: "Send it", readBy: {} },
  questions: { employeeId: "ali", subject: "Help" },
  chats: { type: "group", title: "Everyone" },
  journals: { employeeId: "ali", date: "2026-10-21", slots: {} },
  presenceDaily: { employeeId: "ali", date: "2026-10-21", activeSec: 1, idleSec: 0, breakSec: 0 },
  leaveRequests: { employeeId: "ali", status: "pending" },
  breaks: { employeeId: "ali", date: "2026-10-21" },
  calendar: { date: "2026-12-25", name: "Holiday", type: "holiday", businessId: null },
  notifications: { toUid: "ali", title: "Hi", body: "x", link: "/", readAt: null },
  aiSummaries: { text: "## Highlights" },
  settings: { escalationL1Min: 60, escalationL2Min: 180, briefingEnabled: true, promptMinute: 55, idleMin: 5 },
};
const DOC_ID: Record<string, string> = { settings: "global" };
const idOf = (name: string) => DOC_ID[name] ?? "d1";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-traxio",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    database: { rules: readFileSync("database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "orgs/o1"), { name: "Alpha Co", code: "alpha", ownerUid: "admin1" });
    await setDoc(doc(db, "orgs/o2"), { name: "Beta Co", code: "beta", ownerUid: "admin2" });
    await setDoc(doc(db, "orgCodes/alpha"), { orgId: "o1" });
    for (const [name, data] of Object.entries(OWNED)) await setDoc(doc(db, `orgs/o1/${name}/${idOf(name)}`), data);
    await setDoc(doc(db, "orgs/o1/questions/d1/messages/m1"), { authorId: "ali", body: "hi" });
    await setDoc(doc(db, "orgs/o1/chats/d1/messages/m1"), { authorId: "ali", body: "hi" });
    await setDoc(doc(ctx.firestore(), "orgs/o2/tasks/theirs"), { title: "Beta task", assigneeIds: ["omar"] });
    await set(ref(ctx.database(), "orgs/o1/presence/ali"), { state: "online", since: 1, lastBeat: 1 });
  });
});

describe("another workspace's admin gets nothing", () => {
  it.each(Object.keys(OWNED))("cannot read, list, write or delete %s", async (name) => {
    const db = admin2();
    const path = `orgs/o1/${name}/${idOf(name)}`;
    await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(collection(db, `orgs/o1/${name}`)));
    await assertFails(setDoc(doc(db, `orgs/o1/${name}/planted`), OWNED[name]));
    await assertFails(addDoc(collection(db, `orgs/o1/${name}`), OWNED[name]));
    await assertFails(updateDoc(doc(db, path), { title: "hijacked" }));
    await assertFails(deleteDoc(doc(db, path)));
  });

  it("cannot reach subcollections (messages) either", async () => {
    await assertFails(getDoc(doc(admin2(), "orgs/o1/questions/d1/messages/m1")));
    await assertFails(getDoc(doc(admin2(), "orgs/o1/chats/d1/messages/m1")));
    await assertFails(getDocs(collection(admin2(), "orgs/o1/chats/d1/messages")));
  });

  it("cannot read the workspace record, the code table, or list all workspaces", async () => {
    await assertFails(getDoc(doc(admin2(), "orgs/o1")));
    await assertFails(getDoc(doc(admin2(), "orgCodes/alpha")));
    await assertFails(getDocs(collection(admin2(), "orgs")));
    await assertFails(getDocs(collection(admin2(), "orgCodes")));
  });

  it("cannot sweep every workspace with a collection-group query", async () => {
    for (const name of ["tasks", "users", "notifications", "auditLogs", "journals"]) await assertFails(getDocs(collectionGroup(admin2(), name)));
    await assertFails(getDocs(collectionGroup(admin1(), "tasks")));
  });
});

describe("another workspace's employee gets nothing", () => {
  it.each(Object.keys(OWNED))("cannot read or write %s", async (name) => {
    const db = emp2();
    await assertFails(getDoc(doc(db, `orgs/o1/${name}/${idOf(name)}`)));
    await assertFails(getDocs(collection(db, `orgs/o1/${name}`)));
    await assertFails(setDoc(doc(db, `orgs/o1/${name}/planted`), OWNED[name]));
  });

  it("not even a document that names them: a task assigned to a uid that exists in both", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "orgs/o1/tasks/clash"), { title: "Alpha", assigneeIds: ["omar"] });
    });
    await assertFails(getDoc(doc(emp2(), "orgs/o1/tasks/clash")));
  });
});

describe("a login without a workspace, or without a role, gets nothing anywhere", () => {
  it("no workspace claim", async () => {
    for (const name of Object.keys(OWNED)) await assertFails(getDoc(doc(noOrg(), `orgs/o1/${name}/${idOf(name)}`)));
    await assertFails(getDoc(doc(noOrg(), "orgs/o1")));
  });
  it("a workspace but no role", async () => {
    for (const name of Object.keys(OWNED)) await assertFails(getDoc(doc(noRole(), `orgs/o1/${name}/${idOf(name)}`)));
  });
  it("signed out", async () => {
    await assertFails(getDoc(doc(anon(), "orgs/o1/tasks/d1")));
    await assertFails(getDoc(doc(anon(), "orgs/o1")));
  });
});

describe("a workspace still works for its own people", () => {
  it("the admin and an employee read their own workspace record, and nobody writes it", async () => {
    await assertSucceeds(getDoc(doc(admin1(), "orgs/o1")));
    await assertSucceeds(getDoc(doc(emp1(), "orgs/o1")));
    for (const db of [admin1(), emp1()]) {
      await assertFails(updateDoc(doc(db, "orgs/o1"), { name: "Renamed" }));
      await assertFails(deleteDoc(doc(db, "orgs/o1")));
      await assertFails(setDoc(doc(db, "orgs/o3"), { name: "Mine now", code: "mine" }));
    }
  });
  it("the admin reads their tasks, and writes none (the server does)", async () => {
    await assertSucceeds(getDoc(doc(admin1(), "orgs/o1/tasks/d1")));
    await assertFails(setDoc(doc(admin1(), "orgs/o1/tasks/d2"), { title: "x", assigneeIds: [] }));
  });
  it("the other workspace's own task is reachable by its own admin only", async () => {
    await assertSucceeds(getDoc(doc(admin2(), "orgs/o2/tasks/theirs")));
    await assertFails(getDoc(doc(admin1(), "orgs/o2/tasks/theirs")));
  });
});

describe("live presence is walled off too", () => {
  const rtdb = (uid: string, claims: Record<string, unknown>) => as(uid, claims).database();
  const node = () => ({ state: "online", since: Date.now() - 1000, lastBeat: 0 });

  it("another workspace's admin cannot read presence", async () => {
    await assertSucceeds(get(ref(rtdb("admin1", { role: "admin", orgId: "o1" }), "orgs/o1/presence")));
    await assertFails(get(ref(rtdb("admin2", { role: "admin", orgId: "o2" }), "orgs/o1/presence")));
    await assertFails(get(ref(rtdb("admin2", { role: "admin", orgId: "o2" }), "orgs/o1/presence/ali")));
    await assertFails(get(ref(rtdb("drifter", { role: "admin" }), "orgs/o1/presence")));
  });

  it("another workspace's employee cannot write presence into this one, even under their own uid", async () => {
    await assertFails(set(ref(rtdb("omar", { role: "employee", orgId: "o2" }), "orgs/o1/presence/omar"), node()));
    await assertFails(set(ref(rtdb("omar", { role: "employee", orgId: "o2" }), "orgs/o1/presence/ali"), node()));
  });

  it("nothing is readable at the root or the old flat location", async () => {
    await assertFails(get(ref(rtdb("admin1", { role: "admin", orgId: "o1" }), "orgs")));
    await assertFails(get(ref(rtdb("admin1", { role: "admin", orgId: "o1" }), "presence")));
    expect(true).toBe(true);
  });
});
