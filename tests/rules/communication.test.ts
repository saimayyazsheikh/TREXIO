import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { readFileSync } from "fs";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const emp = (uid: string) => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).firestore();
const stranger = () => env.authenticatedContext("nobody").firestore();

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
    await setDoc(doc(db, "reminders/r1"), { fromUid: "admin1", toUids: ["ali", "sara"], body: "Send the report", readBy: {}, createdAt: Timestamp.now() });
    await setDoc(doc(db, "reminders/r2"), { fromUid: "admin1", toUids: ["sara"], body: "Only Sara", readBy: {}, createdAt: Timestamp.now() });
    await setDoc(doc(db, "questions/q_ali"), { employeeId: "ali", subject: "Printer", status: "open" });
    await setDoc(doc(db, "questions/q_ali/messages/m1"), { authorId: "ali", body: "It jams" });
    await setDoc(doc(db, "questions/q_sara"), { employeeId: "sara", subject: "Leave", status: "open" });
    await setDoc(doc(db, "questions/q_sara/messages/m1"), { authorId: "sara", body: "Private" });
    await setDoc(doc(db, "chats/everyone"), { type: "group", title: "Everyone" });
    await setDoc(doc(db, "chats/everyone/messages/m1"), { authorId: "ali", body: "hi all" });
    await setDoc(doc(db, "chats/dm_ali"), { type: "direct", title: "Ali" });
    await setDoc(doc(db, "chats/dm_ali/messages/m1"), { authorId: "admin1", body: "private to Ali" });
    await setDoc(doc(db, "chats/dm_sara"), { type: "direct", title: "Sara" });
    await setDoc(doc(db, "chats/dm_sara/messages/m1"), { authorId: "sara", body: "private to Sara" });
  });
});

describe("reminders", () => {
  it("recipients and admin read; other employees and role-less users don't", async () => {
    await assertSucceeds(getDoc(doc(emp("ali"), "reminders/r1")));
    await assertSucceeds(getDoc(doc(admin(), "reminders/r2")));
    await assertFails(getDoc(doc(emp("ali"), "reminders/r2")));
    await assertFails(getDoc(doc(stranger(), "reminders/r1")));
  });
  it("a recipient may stamp their own read receipt with the server time", async () => {
    await assertSucceeds(updateDoc(doc(emp("ali"), "reminders/r1"), { "readBy.ali": serverTimestamp() }));
  });
  it("but not someone else's receipt, a fake time, or any other field", async () => {
    const ref = (uid: string) => doc(emp(uid), "reminders/r1");
    await assertFails(updateDoc(ref("ali"), { "readBy.sara": serverTimestamp() }));
    await assertFails(updateDoc(ref("ali"), { "readBy.ali": Timestamp.fromDate(new Date("2020-01-01")) }));
    await assertFails(updateDoc(ref("ali"), { body: "rewritten" }));
    await assertFails(updateDoc(ref("ali"), { toUids: ["ali"] }));
    await assertFails(updateDoc(ref("ali"), { "readBy.ali": serverTimestamp(), body: "sneaky" }));
  });
  it("employees who aren't recipients can't stamp, and the admin can't forge a receipt", async () => {
    await assertFails(updateDoc(doc(emp("omar"), "reminders/r1"), { "readBy.omar": serverTimestamp() }));
    await assertFails(updateDoc(doc(admin(), "reminders/r1"), { "readBy.ali": serverTimestamp() }));
  });
  it("nobody creates or deletes reminders from the client", async () => {
    await assertFails(setDoc(doc(admin(), "reminders/new"), { toUids: ["ali"], body: "x" }));
    await assertFails(deleteDoc(doc(admin(), "reminders/r1")));
    await assertFails(deleteDoc(doc(emp("ali"), "reminders/r1")));
  });
});

describe("questions", () => {
  it("an employee reads only their own question and its messages; the admin reads all", async () => {
    await assertSucceeds(getDoc(doc(emp("ali"), "questions/q_ali")));
    await assertSucceeds(getDoc(doc(emp("ali"), "questions/q_ali/messages/m1")));
    await assertFails(getDoc(doc(emp("ali"), "questions/q_sara")));
    await assertFails(getDoc(doc(emp("ali"), "questions/q_sara/messages/m1")));
    await assertSucceeds(getDoc(doc(admin(), "questions/q_sara/messages/m1")));
    await assertSucceeds(getDocs(collection(admin(), "questions")));
    await assertFails(getDoc(doc(stranger(), "questions/q_ali")));
  });
  it("no client writes, not even from the owner or the admin", async () => {
    await assertFails(updateDoc(doc(emp("ali"), "questions/q_ali"), { status: "closed" }));
    await assertFails(addDoc(collection(emp("ali"), "questions/q_ali/messages"), { authorId: "ali", body: "x" }));
    await assertFails(setDoc(doc(admin(), "questions/new"), { employeeId: "ali" }));
    await assertFails(addDoc(collection(admin(), "questions/q_ali/messages"), { body: "x" }));
  });
});

describe("chat", () => {
  it("an employee reads Everyone and their own direct chat only", async () => {
    await assertSucceeds(getDoc(doc(emp("ali"), "chats/everyone/messages/m1")));
    await assertSucceeds(getDoc(doc(emp("ali"), "chats/dm_ali/messages/m1")));
    await assertSucceeds(getDoc(doc(emp("ali"), "chats/dm_ali")));
    await assertFails(getDoc(doc(emp("ali"), "chats/dm_sara")));
    await assertFails(getDoc(doc(emp("ali"), "chats/dm_sara/messages/m1")));
    await assertFails(getDoc(doc(stranger(), "chats/everyone")));
  });
  it("the admin reads every chat", async () => {
    await assertSucceeds(getDocs(collection(admin(), "chats")));
    await assertSucceeds(getDoc(doc(admin(), "chats/dm_sara/messages/m1")));
  });
  it("messages and chats are never written from the client", async () => {
    await assertFails(addDoc(collection(emp("ali"), "chats/everyone/messages"), { authorId: "ali", body: "forged" }));
    await assertFails(updateDoc(doc(emp("ali"), "chats/everyone/messages/m1"), { body: "edited" }));
    await assertFails(deleteDoc(doc(emp("ali"), "chats/everyone/messages/m1")));
    await assertFails(updateDoc(doc(emp("ali"), "chats/everyone"), { "unread.ali": 0 }));
    await assertFails(addDoc(collection(admin(), "chats/everyone/messages"), { body: "x" }));
  });

  describe("typing markers", () => {
    const typing = (uid: string, chat: string, extra: Record<string, unknown> = {}) => ({ name: uid, at: serverTimestamp(), ...extra, ...(chat ? {} : {}) });
    it("you can set and clear your own, with the server time", async () => {
      await assertSucceeds(setDoc(doc(emp("ali"), "chats/everyone/typing/ali"), typing("ali", "everyone")));
      await assertSucceeds(getDoc(doc(emp("sara"), "chats/everyone/typing/ali")));
      await assertSucceeds(deleteDoc(doc(emp("ali"), "chats/everyone/typing/ali")));
    });
    it("not someone else's, not in a chat you can't use, not with extra fields or a fake time", async () => {
      await assertFails(setDoc(doc(emp("ali"), "chats/everyone/typing/sara"), typing("sara", "everyone")));
      await assertFails(setDoc(doc(emp("ali"), "chats/dm_sara/typing/ali"), typing("ali", "dm_sara")));
      await assertFails(setDoc(doc(emp("ali"), "chats/everyone/typing/ali"), typing("ali", "everyone", { admin: true })));
      await assertFails(setDoc(doc(emp("ali"), "chats/everyone/typing/ali"), { name: "ali", at: Timestamp.fromDate(new Date("2020-01-01")) }));
      await assertFails(setDoc(doc(stranger(), "chats/everyone/typing/nobody"), typing("nobody", "everyone")));
    });
  });
});
