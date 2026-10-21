import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";
import { pktDateString, pktDayIndex } from "@/lib/time";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const emp = (uid: string) => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).firestore();
const stranger = () => env.authenticatedContext("nobody").firestore();

const DAY = 24 * 60 * 60 * 1000;
const today = pktDateString();
const yesterday = pktDateString(new Date(Date.now() - DAY));
const tomorrow = pktDateString(new Date(Date.now() + DAY));
const idx = pktDayIndex();

const slot = (over: Record<string, unknown> = {}) => ({ text: "Opened the shop", taskIds: ["t1"], updatedAt: serverTimestamp(), ...over });
const journal = (uid: string, over: Record<string, unknown> = {}) => ({
  employeeId: uid, date: today, dayIndex: idx, slots: { "10": slot() }, updatedAt: serverTimestamp(), ...over,
});
const ref = (db: ReturnType<typeof emp>, uid: string, date = today) => doc(db, "journals", `${uid}_${date}`);

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
    await setDoc(doc(db, `journals/ali_${yesterday}`), { employeeId: "ali", date: yesterday, dayIndex: idx - 1, slots: { "10": { text: "Old entry", taskIds: [], updatedAt: Timestamp.now() } }, updatedAt: Timestamp.now() });
    await setDoc(doc(db, `journals/sara_${today}`), { employeeId: "sara", date: today, dayIndex: idx, slots: {}, updatedAt: Timestamp.now() });
  });
});

describe("writing today's journal", () => {
  it("an employee creates their own journal for today", async () => {
    await assertSucceeds(setDoc(ref(emp("ali"), "ali"), journal("ali")));
  });
  it("and keeps adding hours with merge writes (what the app does)", async () => {
    await setDoc(ref(emp("ali"), "ali"), journal("ali"));
    await assertSucceeds(setDoc(ref(emp("ali"), "ali"), { employeeId: "ali", date: today, dayIndex: idx, slots: { "11": slot({ text: "Cash up", taskIds: [] }) }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(ref(emp("ali"), "ali"), { employeeId: "ali", date: today, dayIndex: idx, slots: { "10": slot({ text: "Edited", taskIds: ["t1", "t2"] }) }, updatedAt: serverTimestamp() }, { merge: true }));
  });
  it("reading a day that has no journal yet is allowed", async () => {
    await assertSucceeds(getDoc(ref(emp("ali"), "ali", tomorrow)));
  });
});

describe("the midnight lock cannot be bypassed", () => {
  it("yesterday's journal is read-only: no edits, no overwrites, no deletes", async () => {
    await assertSucceeds(getDoc(ref(emp("ali"), "ali", yesterday)));
    await assertFails(updateDoc(ref(emp("ali"), "ali", yesterday), { "slots.10.text": "Rewriting history" }));
    await assertFails(setDoc(ref(emp("ali"), "ali", yesterday), journal("ali", { date: yesterday, dayIndex: idx - 1 })));
    await assertFails(setDoc(ref(emp("ali"), "ali", yesterday), { slots: { "11": slot() } }, { merge: true }));
    await assertFails(deleteDoc(ref(emp("ali"), "ali", yesterday)));
  });
  it("lying inside the document doesn't help: yesterday's id with today's date and index is still refused", async () => {
    await assertFails(setDoc(ref(emp("ali"), "ali", yesterday), journal("ali"))); // body says today
    await assertFails(setDoc(ref(emp("ali"), "ali", tomorrow), journal("ali"))); // future day
    await assertFails(setDoc(ref(emp("ali"), "ali", tomorrow), journal("ali", { date: tomorrow, dayIndex: idx + 1 })));
  });
  it("today's id with a body claiming another day or index is refused", async () => {
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { date: yesterday })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { dayIndex: idx - 1 })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { dayIndex: idx + 1 })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { dayIndex: String(idx) })));
  });
  it("a made-up timestamp can't stand in for the server time", async () => {
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { updatedAt: Timestamp.fromDate(new Date(Date.now() - 2 * DAY)) })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { updatedAt: Timestamp.now() })));
  });
  it("once created, the identity of a journal can't be changed", async () => {
    await setDoc(ref(emp("ali"), "ali"), journal("ali"));
    await assertFails(updateDoc(ref(emp("ali"), "ali"), { employeeId: "sara", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(emp("ali"), "ali"), { date: yesterday, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(emp("ali"), "ali"), { dayIndex: idx - 1, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref(emp("ali"), "ali")));
  });
});

describe("whose journal", () => {
  it("nobody writes someone else's journal, even for today", async () => {
    await assertFails(setDoc(ref(emp("ali"), "sara"), journal("sara")));
    await assertFails(setDoc(ref(emp("ali"), "sara"), journal("ali"))); // someone else's id
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("sara"))); // someone else's employeeId
    await assertFails(updateDoc(ref(emp("ali"), "sara"), { "slots.10": slot(), updatedAt: serverTimestamp() }));
  });
  it("the admin can read but never write journals", async () => {
    await assertSucceeds(getDoc(ref(admin(), "ali", yesterday)));
    await assertSucceeds(getDocs(query(collection(admin(), "journals"), where("date", "==", today))));
    await assertFails(setDoc(ref(admin(), "ali"), journal("ali")));
    await assertFails(updateDoc(ref(admin(), "sara"), { "slots.10": slot(), updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref(admin(), "sara")));
  });
  it("employees read only their own", async () => {
    await assertSucceeds(getDoc(ref(emp("sara"), "sara")));
    await assertFails(getDoc(ref(emp("ali"), "sara")));
    await assertSucceeds(getDocs(query(collection(emp("ali"), "journals"), where("employeeId", "==", "ali"))));
    await assertFails(getDocs(query(collection(emp("ali"), "journals"), where("employeeId", "==", "sara"))));
    await assertFails(getDocs(collection(emp("ali"), "journals")));
  });
  it("a signed-in user with no role has no access", async () => {
    await assertFails(getDoc(ref(stranger(), "nobody")));
    await assertFails(setDoc(ref(stranger(), "nobody"), journal("nobody")));
  });
});

describe("the shape of the data", () => {
  it("rejects extra fields, missing fields and bad slot keys", async () => {
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { admin: true })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), { employeeId: "ali", date: today, dayIndex: idx, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { slots: { "24": slot() } })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { slots: { "9": slot() } })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { slots: { abc: slot() } })));
    await assertFails(setDoc(ref(emp("ali"), "ali"), journal("ali", { slots: "nope" })));
  });
  it("limits what goes in a slot", async () => {
    await assertSucceeds(setDoc(ref(emp("ali"), "ali"), journal("ali", { slots: { "23": slot({ text: "x".repeat(2000) }) } })));
    await assertFails(setDoc(ref(emp("sara"), "sara"), journal("sara", { slots: { "10": slot({ text: "x".repeat(2001) }) } })));
    await assertFails(setDoc(ref(emp("sara"), "sara"), journal("sara", { slots: { "10": slot({ taskIds: Array.from({ length: 21 }, (_, i) => `t${i}`) }) } })));
    await assertFails(setDoc(ref(emp("sara"), "sara"), journal("sara", { slots: { "10": slot({ text: 42 }) } })));
    await assertFails(setDoc(ref(emp("sara"), "sara"), journal("sara", { slots: { "10": slot({ extra: "x" }) } })));
    await assertFails(setDoc(ref(emp("sara"), "sara"), journal("sara", { slots: { "10": "just text" } })));
  });
});
