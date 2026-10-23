import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const employee = (uid: string) => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const settings = (over: Record<string, unknown> = {}) => ({ escalationL1Min: 60, escalationL2Min: 180, briefingEnabled: true, weeklySummaryWhatsApp: false, promptMinute: 55, idleMin: 5, adminPhone: "", ...over });

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
    await setDoc(doc(db, "notifications/n_ali"), { ...base, toUid: "ali" });
    await setDoc(doc(db, "notifications/n_sara"), { ...base, toUid: "sara" });
    await setDoc(doc(db, "notifications/n_admin"), { ...base, toUid: "admin" });
    await setDoc(doc(db, "settings/global"), settings());
    await setDoc(doc(db, "whatsappLogs/w1"), { kind: "nudge", status: "mock", createdAt: new Date() });
  });
});

describe("notifications", () => {
  it("each person reads only their own mailbox; the admin reads the admin one", async () => {
    await assertSucceeds(getDoc(doc(employee("ali"), "notifications/n_ali")));
    await assertFails(getDoc(doc(employee("ali"), "notifications/n_sara")));
    await assertFails(getDoc(doc(employee("ali"), "notifications/n_admin")));
    await assertSucceeds(getDoc(doc(admin(), "notifications/n_admin")));
    await assertFails(getDoc(doc(admin(), "notifications/n_ali")));
    await assertFails(getDoc(doc(stranger(), "notifications/n_ali")));
  });
  it("a scoped list works and an unscoped one is refused", async () => {
    await assertSucceeds(getDocs(query(collection(employee("ali"), "notifications"), where("toUid", "==", "ali"))));
    await assertFails(getDocs(collection(employee("ali"), "notifications")));
    await assertFails(getDocs(query(collection(employee("ali"), "notifications"), where("toUid", "==", "sara"))));
    await assertSucceeds(getDocs(query(collection(admin(), "notifications"), where("toUid", "==", "admin"))));
  });
  it("the owner can mark one read, once, and change nothing else", async () => {
    await assertFails(updateDoc(doc(employee("ali"), "notifications/n_ali"), { readAt: new Date("2020-01-01") }));
    await assertFails(updateDoc(doc(employee("ali"), "notifications/n_ali"), { readAt: serverTimestamp(), title: "Edited" }));
    await assertSucceeds(updateDoc(doc(employee("ali"), "notifications/n_ali"), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(employee("ali"), "notifications/n_ali"), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(employee("sara"), "notifications/n_ali"), { readAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(admin(), "notifications/n_admin"), { readAt: serverTimestamp() }));
  });
  it("nobody creates or deletes notifications from the browser", async () => {
    for (const db of [admin(), employee("ali")]) {
      await assertFails(addDoc(collection(db, "notifications"), { toUid: "ali", title: "Fake", body: "x", link: "/", readAt: null, createdAt: new Date() }));
      await assertFails(deleteDoc(doc(db, "notifications/n_ali")));
    }
  });
});

describe("settings/global", () => {
  it("every signed-in person reads it, nobody else", async () => {
    await assertSucceeds(getDoc(doc(employee("ali"), "settings/global")));
    await assertSucceeds(getDoc(doc(admin(), "settings/global")));
    await assertFails(getDoc(doc(stranger(), "settings/global")));
    await assertFails(getDocs(collection(admin(), "settings")));
  });
  it("only the admin writes, and only valid values", async () => {
    await assertSucceeds(setDoc(doc(admin(), "settings/global"), settings({ escalationL1Min: 30, escalationL2Min: 90, idleMin: 10, adminPhone: "+923001234567" })));
    await assertFails(setDoc(doc(employee("ali"), "settings/global"), settings()));
    await assertFails(setDoc(doc(admin(), "settings/other"), settings()));
    for (const bad of [
      { escalationL1Min: 5 },
      { escalationL1Min: 200, escalationL2Min: 100 },
      { escalationL2Min: 3000 },
      { promptMinute: 60 },
      { idleMin: 0 },
      { idleMin: 5.5 },
      { briefingEnabled: "yes" },
      { weeklySummaryWhatsApp: "yes" },
      { adminPhone: "0300 1234567" },
      { adminPhone: "+92300" },
    ]) {
      await assertFails(setDoc(doc(admin(), "settings/global"), settings(bad)));
    }
  });
  it("no extra or missing fields", async () => {
    await assertFails(setDoc(doc(admin(), "settings/global"), { ...settings(), sneaky: true }));
    const missing: Record<string, unknown> = settings();
    delete missing.adminPhone;
    await assertFails(setDoc(doc(admin(), "settings/global"), missing));
    await assertFails(deleteDoc(doc(admin(), "settings/global")));
  });
});

describe("aiSummaries", () => {
  it("the admin reads them; nobody writes", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "aiSummaries/week_2026-10-12"), { text: "## Highlights", createdAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(admin(), "aiSummaries/week_2026-10-12")));
    await assertSucceeds(getDocs(collection(admin(), "aiSummaries")));
    await assertFails(getDoc(doc(employee("ali"), "aiSummaries/week_2026-10-12")));
    for (const db of [admin(), employee("ali")]) {
      await assertFails(setDoc(doc(db, "aiSummaries/forged"), { text: "x" }));
      await assertFails(updateDoc(doc(db, "aiSummaries/week_2026-10-12"), { text: "edited" }));
      await assertFails(deleteDoc(doc(db, "aiSummaries/week_2026-10-12")));
    }
  });
});

describe("whatsappLogs", () => {
  it("the admin reads them; nobody writes", async () => {
    await assertSucceeds(getDoc(doc(admin(), "whatsappLogs/w1")));
    await assertFails(getDoc(doc(employee("ali"), "whatsappLogs/w1")));
    for (const db of [admin(), employee("ali")]) {
      await assertFails(addDoc(collection(db, "whatsappLogs"), { kind: "forged" }));
      await assertFails(updateDoc(doc(db, "whatsappLogs/w1"), { status: "sent" }));
      await assertFails(deleteDoc(doc(db, "whatsappLogs/w1")));
    }
  });
});
