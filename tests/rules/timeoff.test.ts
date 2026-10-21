import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { readFileSync } from "fs";
import { pktDateString } from "@/lib/time";

let env: RulesTestEnvironment;

const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const emp = (uid: string) => env.authenticatedContext(uid, { role: "employee", businessId: "b1" }).firestore();
const stranger = () => env.authenticatedContext("nobody").firestore();

const DAY = 24 * 60 * 60 * 1000;
const today = pktDateString();
const yesterday = pktDateString(new Date(Date.now() - DAY));

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
    await setDoc(doc(db, "leaveRequests/l_ali"), { employeeId: "ali", status: "pending" });
    await setDoc(doc(db, "leaveRequests/l_sara"), { employeeId: "sara", status: "pending" });
    await setDoc(doc(db, "breaks/b_ali"), { employeeId: "ali", date: today, endAt: null });
    await setDoc(doc(db, "breaks/b_sara"), { employeeId: "sara", date: today, endAt: null });
    // Ali has a presence record for today, last written a minute ago, and one from yesterday.
    await setDoc(doc(db, `presenceDaily/ali_${today}`), { employeeId: "ali", date: today, activeSec: 600, idleSec: 60, breakSec: 0, firstSeenAt: Timestamp.fromMillis(Date.now() - 3600_000), lastSeenAt: Timestamp.fromMillis(Date.now() - 60_000) });
    await setDoc(doc(db, `presenceDaily/ali_${yesterday}`), { employeeId: "ali", date: yesterday, activeSec: 7200, idleSec: 0, breakSec: 0, firstSeenAt: Timestamp.now(), lastSeenAt: Timestamp.now() });
  });
});

describe("leave requests and breaks", () => {
  it("employees read only their own; the admin reads all", async () => {
    await assertSucceeds(getDoc(doc(emp("ali"), "leaveRequests/l_ali")));
    await assertFails(getDoc(doc(emp("ali"), "leaveRequests/l_sara")));
    await assertSucceeds(getDocs(query(collection(emp("ali"), "leaveRequests"), where("employeeId", "==", "ali"))));
    await assertFails(getDocs(collection(emp("ali"), "leaveRequests")));
    await assertSucceeds(getDocs(collection(admin(), "leaveRequests")));
    await assertSucceeds(getDoc(doc(emp("ali"), "breaks/b_ali")));
    await assertFails(getDoc(doc(emp("ali"), "breaks/b_sara")));
    await assertFails(getDoc(doc(stranger(), "breaks/b_ali")));
  });
  it("nobody writes them from the client, not even to approve their own leave", async () => {
    await assertFails(updateDoc(doc(emp("ali"), "leaveRequests/l_ali"), { status: "approved" }));
    await assertFails(setDoc(doc(emp("ali"), "leaveRequests/new"), { employeeId: "ali", status: "approved" }));
    await assertFails(deleteDoc(doc(emp("ali"), "leaveRequests/l_ali")));
    await assertFails(updateDoc(doc(admin(), "leaveRequests/l_ali"), { status: "approved" }));
    await assertFails(updateDoc(doc(emp("ali"), "breaks/b_ali"), { endAt: serverTimestamp() }));
    await assertFails(setDoc(doc(emp("ali"), "breaks/new"), { employeeId: "ali" }));
  });
});

describe("holiday and closure calendar", () => {
  const entry = (over: Record<string, unknown> = {}) => ({ date: "2026-08-14", name: "Independence Day", type: "holiday", businessId: null, ...over });
  it("the admin creates holidays and closures with the right id and type", async () => {
    await assertSucceeds(setDoc(doc(admin(), "calendar/2026-08-14_all"), entry()));
    await assertSucceeds(setDoc(doc(admin(), "calendar/2026-10-30_b1"), entry({ date: "2026-10-30", name: "Stocktake", type: "closure", businessId: "b1" })));
    await assertSucceeds(deleteDoc(doc(admin(), "calendar/2026-08-14_all")));
  });
  it("rejects mismatched ids and types, extra fields and malformed data", async () => {
    await assertFails(setDoc(doc(admin(), "calendar/whatever"), entry()));
    await assertFails(setDoc(doc(admin(), "calendar/2026-08-14_b1"), entry())); // id says business, body says everyone
    await assertFails(setDoc(doc(admin(), "calendar/2026-08-14_all"), entry({ type: "closure" })));
    await assertFails(setDoc(doc(admin(), "calendar/2026-08-14_all"), entry({ extra: true })));
    await assertFails(setDoc(doc(admin(), "calendar/14-08-2026_all"), entry({ date: "14-08-2026" })));
    await assertFails(setDoc(doc(admin(), "calendar/2026-08-14_all"), entry({ name: "x" })));
  });
  it("employees can read it but never change it", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => void (await setDoc(doc(ctx.firestore(), "calendar/2026-08-14_all"), entry())));
    await assertSucceeds(getDoc(doc(emp("ali"), "calendar/2026-08-14_all")));
    await assertSucceeds(getDocs(collection(emp("ali"), "calendar")));
    await assertFails(setDoc(doc(emp("ali"), "calendar/2026-08-15_all"), entry({ date: "2026-08-15" })));
    await assertFails(deleteDoc(doc(emp("ali"), "calendar/2026-08-14_all")));
    await assertFails(getDoc(doc(stranger(), "calendar/2026-08-14_all")));
  });
});

describe("daily time totals", () => {
  const ref = (uid: string, date = today, db = emp(uid)) => doc(db, "presenceDaily", `${uid}_${date}`);
  const fresh = (uid: string, over: Record<string, unknown> = {}) => ({
    employeeId: uid, date: today, activeSec: 30, idleSec: 0, breakSec: 0, firstSeenAt: serverTimestamp(), lastSeenAt: serverTimestamp(), ...over,
  });

  it("creating today's record with a plausible total works", async () => {
    await assertSucceeds(setDoc(ref("sara"), fresh("sara")));
  });
  it("can't create a record claiming more time than the day has had", async () => {
    await assertFails(setDoc(ref("sara"), fresh("sara", { activeSec: 100_000 })));
    await assertFails(setDoc(ref("sara"), fresh("sara", { activeSec: 60_000, idleSec: 60_000 })));
  });
  it("can't create records for another day, another person, or with odd fields", async () => {
    await assertFails(setDoc(ref("sara", yesterday), fresh("sara", { date: yesterday })));
    await assertFails(setDoc(ref("sara", yesterday), fresh("sara")));
    await assertFails(setDoc(ref("ali", today, emp("sara")), fresh("ali")));
    await assertFails(setDoc(ref("sara"), fresh("ali")));
    await assertFails(setDoc(ref("sara"), fresh("sara", { extra: 1 })));
    await assertFails(setDoc(ref("sara"), fresh("sara", { activeSec: -5 })));
    await assertFails(setDoc(ref("sara"), fresh("sara", { activeSec: 1.5 })));
    await assertFails(setDoc(ref("sara"), fresh("sara", { firstSeenAt: Timestamp.fromMillis(Date.now() - 5 * DAY) })));
  });

  it("a normal flush adds the time that really passed", async () => {
    await assertSucceeds(updateDoc(ref("ali"), { activeSec: increment(55), idleSec: increment(5), lastSeenAt: serverTimestamp() }));
  });
  it("a flush can't add far more time than elapsed since the last one", async () => {
    await assertFails(updateDoc(ref("ali"), { activeSec: increment(5_000), lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref("ali"), { activeSec: increment(100), idleSec: increment(100), breakSec: increment(100), lastSeenAt: serverTimestamp() }));
  });
  it("totals can never go down, and identity fields never change", async () => {
    await assertFails(updateDoc(ref("ali"), { activeSec: increment(-100), lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref("ali"), { employeeId: "sara", lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref("ali"), { date: yesterday, lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref("ali"), { firstSeenAt: serverTimestamp(), lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref("ali"), { activeSec: increment(10) })); // lastSeenAt must be the server time
  });
  it("yesterday's record is locked, and nobody deletes anything", async () => {
    await assertFails(updateDoc(ref("ali", yesterday), { activeSec: increment(10), lastSeenAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref("ali")));
    await assertFails(deleteDoc(ref("ali", yesterday)));
  });
  it("the admin and other employees can't write; reads are scoped", async () => {
    await assertFails(updateDoc(ref("ali", today, admin()), { activeSec: increment(10), lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref("ali", today, emp("sara")), { activeSec: increment(10), lastSeenAt: serverTimestamp() }));
    await assertSucceeds(getDoc(ref("ali", today, admin())));
    await assertSucceeds(getDocs(query(collection(admin(), "presenceDaily"), where("date", "==", today))));
    await assertSucceeds(getDoc(ref("ali")));
    await assertSucceeds(getDoc(ref("sara"))); // no record yet is fine to read
    await assertFails(getDoc(ref("ali", today, emp("sara"))));
    await assertSucceeds(getDocs(query(collection(emp("ali"), "presenceDaily"), where("employeeId", "==", "ali"))));
    await assertFails(getDocs(collection(emp("ali"), "presenceDaily")));
    await assertFails(getDoc(ref("ali", today, stranger())));
  });
});
