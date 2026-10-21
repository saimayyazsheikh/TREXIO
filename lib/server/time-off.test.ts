import { beforeEach, describe, expect, it } from "vitest";
import { finalizeStaleBreaks, handleBreak, handleLeave } from "@/lib/server/time-off";
import { makeDocDb, seedDocs } from "@/lib/server/test-support/memory-doc-db";
import { breakActionSchema, leaveActionSchema } from "@/lib/domain/timeoff";
import type { DocDb } from "@/lib/server/communication";
import type { Actor } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T08:00:00Z"); // 13:00 PKT, Wednesday 2026-10-21
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali12345", name: "Ali Khan", role: "employee" };
const sara: Actor = { uid: "sara9999", name: "Sara Ahmed", role: "employee" };

let docs: Map<string, Record<string, unknown>>;
let db: DocDb;
beforeEach(() => {
  docs = seedDocs();
  db = makeDocDb(docs, now);
});

const start = (type = "namaz", note = "") => breakActionSchema.parse({ action: "start", type, note });
const end = () => breakActionSchema.parse({ action: "end" });
const breaksOf = (uid: string) => [...docs].filter(([p, d]) => p.startsWith("breaks/") && d.employeeId === uid);

describe("breaks", () => {
  it("starting records who, what kind, the note and the day, with no end yet", async () => {
    const { breakId } = await handleBreak(db, ali, start("lunch", "quick bite"));
    expect(docs.get(`breaks/${breakId}`)).toMatchObject({ employeeId: "ali12345", employeeName: "Ali Khan", type: "lunch", note: "quick bite", date: "2026-10-21", startAt: now, endAt: null });
  });
  it("only employees take breaks, one at a time", async () => {
    await expect(handleBreak(db, admin, start())).rejects.toMatchObject({ status: 403 });
    await handleBreak(db, ali, start());
    await expect(handleBreak(db, ali, start("lunch"))).rejects.toMatchObject({ status: 409 });
    await expect(handleBreak(db, sara, start("lunch"))).resolves.toBeTruthy(); // someone else is fine
  });
  it("ending closes your open break and only yours", async () => {
    await handleBreak(db, ali, start());
    await handleBreak(db, sara, start("lunch"));
    await handleBreak(db, ali, end());
    expect(breaksOf("ali12345")[0][1].endAt).toEqual(now);
    expect(breaksOf("sara9999")[0][1].endAt).toBeNull();
    await expect(handleBreak(db, ali, end())).rejects.toMatchObject({ status: 409 });
  });
  it("a break forgotten from yesterday is closed at midnight, then a new one can start", async () => {
    docs.set("breaks/old1", { employeeId: "ali12345", date: "2026-10-20", type: "other", note: "", startAt: new Date("2026-10-20T10:00:00Z"), endAt: null });
    await handleBreak(db, ali, start("lunch"));
    expect(docs.get("breaks/old1")?.endAt).toEqual(new Date("2026-10-20T19:00:00.000Z")); // 00:00 PKT on the 21st
    expect(breaksOf("ali12345")).toHaveLength(2);
  });
  it("ending when only a stale break exists closes it at midnight, not now", async () => {
    docs.set("breaks/old1", { employeeId: "ali12345", date: "2026-10-20", type: "other", note: "", startAt: new Date("2026-10-20T10:00:00Z"), endAt: null });
    await handleBreak(db, ali, end());
    expect(docs.get("breaks/old1")?.endAt).toEqual(new Date("2026-10-20T19:00:00.000Z"));
  });
  it("the nightly job closes every stale open break once, and leaves today's alone", async () => {
    docs.set("breaks/old1", { employeeId: "ali12345", date: "2026-10-19", type: "other", startAt: new Date("2026-10-19T10:00:00Z"), endAt: null });
    docs.set("breaks/old2", { employeeId: "sara9999", date: "2026-10-20", type: "other", startAt: new Date("2026-10-20T10:00:00Z"), endAt: null });
    docs.set("breaks/today", { employeeId: "sara9999", date: "2026-10-21", type: "other", startAt: now, endAt: null });
    await expect(finalizeStaleBreaks(db)).resolves.toEqual({ closed: 2 });
    expect(docs.get("breaks/old1")?.endAt).toEqual(new Date("2026-10-19T19:00:00.000Z"));
    expect(docs.get("breaks/today")?.endAt).toBeNull();
    await expect(finalizeStaleBreaks(db)).resolves.toEqual({ closed: 0 });
  });
});

describe("leave requests", () => {
  const create = (over: Record<string, unknown> = {}) => leaveActionSchema.parse({ action: "create", kind: "leave", fromDate: "2026-10-22", toDate: "2026-10-23", reason: "Family wedding", ...over });
  const decide = (requestId: string, decision: "approve" | "reject", note = "") => leaveActionSchema.parse({ action: "decide", requestId, decision, note });
  const cancel = (requestId: string) => leaveActionSchema.parse({ action: "cancel", requestId });
  let rid: string;
  beforeEach(async () => {
    rid = (await handleLeave(db, ali, create())).requestId!;
  });

  it("a new request is pending with the employee's details and no decision", () => {
    expect(docs.get(`leaveRequests/${rid}`)).toMatchObject({ employeeId: "ali12345", employeeName: "Ali Khan", businessId: "b1", kind: "leave", fromDate: "2026-10-22", toDate: "2026-10-23", status: "pending", decidedBy: null });
  });
  it("only employees ask, with valid dates and their own files", async () => {
    await expect(handleLeave(db, admin, create())).rejects.toMatchObject({ status: 403 });
    await expect(handleLeave(db, ali, create({ fromDate: "2026-10-25", toDate: "2026-10-24" }))).rejects.toThrow(/before the start/);
    const file = { name: "a.pdf", url: `https://x.test/v0/b/x/o/${encodeURIComponent("u/sara9999/leave/a.pdf")}`, size: 1, type: "application/pdf" };
    await expect(handleLeave(db, ali, create({ attachments: [file] }))).rejects.toThrow(/can't be attached/);
  });
  it("the admin approves; the decision is recorded; it can't be decided twice", async () => {
    await handleLeave(db, admin, decide(rid, "approve", "Enjoy"));
    expect(docs.get(`leaveRequests/${rid}`)).toMatchObject({ status: "approved", decidedBy: "admin1", decidedByName: "Boss", decisionNote: "Enjoy", decidedAt: now });
    await expect(handleLeave(db, admin, decide(rid, "reject", "changed my mind"))).rejects.toMatchObject({ status: 409 });
  });
  it("rejecting needs a reason", async () => {
    await expect(handleLeave(db, admin, decide(rid, "reject"))).rejects.toThrow(/why/);
    await handleLeave(db, admin, decide(rid, "reject", "Month-end week"));
    expect(docs.get(`leaveRequests/${rid}`)?.status).toBe("rejected");
  });
  it("employees can't decide, and can't see or cancel someone else's request", async () => {
    await expect(handleLeave(db, ali, decide(rid, "approve"))).rejects.toMatchObject({ status: 403 });
    await expect(handleLeave(db, sara, cancel(rid))).rejects.toMatchObject({ status: 404 });
  });
  it("you can cancel your own pending request, but not one already decided", async () => {
    await handleLeave(db, ali, cancel(rid));
    expect(docs.get(`leaveRequests/${rid}`)?.status).toBe("cancelled");
    await expect(handleLeave(db, ali, cancel(rid))).rejects.toMatchObject({ status: 409 });
    const second = (await handleLeave(db, ali, create())).requestId!;
    await handleLeave(db, admin, decide(second, "approve"));
    await expect(handleLeave(db, ali, cancel(second))).rejects.toMatchObject({ status: 409 });
  });
  it("missing requests are a clean 404", async () => {
    await expect(handleLeave(db, admin, decide("nope", "approve"))).rejects.toMatchObject({ status: 404 });
  });
});
