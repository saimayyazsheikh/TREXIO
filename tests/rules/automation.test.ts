import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin", orgId: "o1" }).firestore();
const employee = (uid: string) => env.authenticatedContext(uid, { role: "employee", orgId: "o1", businessId: "b1" }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const settings = (over: Record<string, unknown> = {}) => ({ escalationL1Min: 60, escalationL2Min: 180, briefingEnabled: true, promptMinute: 55, idleMin: 5, ...over });

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
    const base = { title: "Reminder", body: "Send the report", link: "/me/reminders", readAt: null, createdAt: new Date() };
    await setDoc(doc(db, "orgs/o1/notifications/n_ali"), { ...base, toUid: "ali" });
    await setDoc(doc(db, "orgs/o1/notifications/n_sara"), { ...base, toUid: "sara" });
    await setDoc(doc(db, "orgs/o1/notifications/n_admin"), { ...base, toUid: "admin" });
    await setDoc(doc(db, "orgs/o1/settings/global"), settings());
  });
});

describe("notifications", () => {
  it("each person reads only their own mailbox; the admin reads the admin one", async () => {
    await assertSucceeds(getDoc(doc(employee("ali"), "orgs/o1/notifications/n_ali")));
    await assertFails(getDoc(doc(employee("ali"), "orgs/o1/notifications/n_sara")));
    await assertFails(getDoc(doc(employee("ali"), "orgs/o1/notifications/n_admin")));
    await assertSucceeds(getDoc(doc(admin(), "orgs/o1/notifications/n_admin")));
    await assertFails(getDoc(doc(admin(), "orgs/o1/notifications/n_ali")));
    await assertFails(getDoc(doc(stranger(), "orgs/o1/notifications/n_ali")));
  });
  it("a scoped list works and an unscoped one is refused", async () => {
    await assertSucceeds(getDocs(query(collection(employee("ali"), "orgs/o1/notifications"), where("toUid", "==", "ali"))));
    await assertFails(getDocs(collection(employee("ali"), "orgs/o1/notifications")));
    await assertFails(getDocs(query(collection(employee("ali"), "orgs/o1/notifications"), where("toUid", "==", "sara"))));
    await assertSucceeds(getDocs(query(collection(admin(), "orgs/o1/notifications"), where("toUid", "==", "admin"))));
  });
  it("the owner can mark one read, once, and change nothing else", async () => {
    await assertFails(updateDoc(doc(employee("ali"), "orgs/o1/notifications/n_ali"), { readAt: new Date("2020-01-01") }));
    await assertFails(updateDoc(doc(employee("ali"), "orgs/o1/notifications/n_ali"), { readAt: serverTimestamp(), title: "Edited" }));
    await assertSucceeds(updateDoc(doc(employee("ali"), "orgs/o1/notifications/n_ali"), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(employee("ali"), "orgs/o1/notifications/n_ali"), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(employee("sara"), "orgs/o1/notifications/n_ali"), { readAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(admin(), "orgs/o1/notifications/n_admin"), { readAt: serverTimestamp() }));
  });
  it("nobody creates or deletes notifications from the browser", async () => {
    for (const db of [admin(), employee("ali")]) {
      await assertFails(addDoc(collection(db, "orgs/o1/notifications"), { toUid: "ali", title: "Fake", body: "x", link: "/", readAt: null, createdAt: new Date() }));
      await assertFails(deleteDoc(doc(db, "orgs/o1/notifications/n_ali")));
    }
  });
});

describe("settings/global", () => {
  it("every signed-in person reads it, nobody else", async () => {
    await assertSucceeds(getDoc(doc(employee("ali"), "orgs/o1/settings/global")));
    await assertSucceeds(getDoc(doc(admin(), "orgs/o1/settings/global")));
    await assertFails(getDoc(doc(stranger(), "orgs/o1/settings/global")));
    await assertFails(getDocs(collection(admin(), "orgs/o1/settings")));
  });
  it("only the admin writes, and only valid values", async () => {
    await assertSucceeds(setDoc(doc(admin(), "orgs/o1/settings/global"), settings({ escalationL1Min: 30, escalationL2Min: 90, idleMin: 10 })));
    await assertFails(setDoc(doc(employee("ali"), "orgs/o1/settings/global"), settings()));
    await assertFails(setDoc(doc(admin(), "orgs/o1/settings/other"), settings()));
    for (const bad of [
      { escalationL1Min: 5 },
      { escalationL1Min: 200, escalationL2Min: 100 },
      { escalationL2Min: 3000 },
      { promptMinute: 60 },
      { idleMin: 0 },
      { idleMin: 5.5 },
      { briefingEnabled: "yes" },
    ]) {
      await assertFails(setDoc(doc(admin(), "orgs/o1/settings/global"), settings(bad)));
    }
  });
  it("no extra or missing fields", async () => {
    await assertFails(setDoc(doc(admin(), "orgs/o1/settings/global"), { ...settings(), sneaky: true }));
    const missing: Record<string, unknown> = settings();
    delete missing.idleMin;
    await assertFails(setDoc(doc(admin(), "orgs/o1/settings/global"), missing));
    await assertFails(deleteDoc(doc(admin(), "orgs/o1/settings/global")));
  });
});

describe("aiSummaries", () => {
  it("the admin reads them; nobody writes", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "orgs/o1/aiSummaries/week_2026-10-12"), { text: "## Highlights", createdAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(admin(), "orgs/o1/aiSummaries/week_2026-10-12")));
    await assertSucceeds(getDocs(collection(admin(), "orgs/o1/aiSummaries")));
    await assertFails(getDoc(doc(employee("ali"), "orgs/o1/aiSummaries/week_2026-10-12")));
    for (const db of [admin(), employee("ali")]) {
      await assertFails(setDoc(doc(db, "orgs/o1/aiSummaries/forged"), { text: "x" }));
      await assertFails(updateDoc(doc(db, "orgs/o1/aiSummaries/week_2026-10-12"), { text: "edited" }));
      await assertFails(deleteDoc(doc(db, "orgs/o1/aiSummaries/week_2026-10-12")));
    }
  });
});
