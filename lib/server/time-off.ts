import { DomainError } from "@/lib/domain/errors";
import { assertValidLeave, type BreakAction, type LeaveAction } from "@/lib/domain/timeoff";
import type { Actor } from "@/lib/domain/tasks";
import { pktDateString, pktDayBounds } from "@/lib/time";
import type { DocDb, DocTx } from "@/lib/server/communication";
import { ADMIN_MAILBOX, queueNotification } from "@/lib/server/notify";

type Doc = Record<string, unknown>;
const MAX_PENDING_REQUESTS = 20;

const requireEmployee = (a: Actor, what: string) => {
  if (a.role !== "employee") throw new DomainError(`Only team members can ${what}.`, 403);
};
const requireAdmin = (a: Actor, what: string) => {
  if (a.role !== "admin") throw new DomainError(`Only the admin can ${what}.`, 403);
};

/** The latest an open break could have run: the end of the PKT day it started on. */
const endOfBreakDay = (breakDate: string) => pktDayBounds(breakDate).end;

async function openBreaks(tx: DocTx, uid: string) {
  return tx.find("breaks", [["employeeId", uid], ["endAt", null]]);
}

/* ---------------------------------- Breaks ---------------------------------- */

/** Start or end your break. One break at a time; a break forgotten from an earlier day is closed at midnight. */
export function handleBreak(db: DocDb, actor: Actor, input: BreakAction): Promise<{ breakId?: string }> {
  return db.transaction(async (tx) => {
    requireEmployee(actor, "take breaks");
    const now = db.now();
    const today = pktDateString(now);
    const open = await openBreaks(tx, actor.uid);
    const stale = open.filter((b) => String(b.data.date) < today);
    const current = open.filter((b) => String(b.data.date) >= today);

    if (input.action === "start") {
      if (current.length > 0) throw new DomainError("You're already on a break. End it first.", 409);
      for (const b of stale) tx.update(`breaks/${b.id}`, { endAt: endOfBreakDay(String(b.data.date)) });
      const breakId = db.newId();
      tx.create(`breaks/${breakId}`, { employeeId: actor.uid, employeeName: actor.name, date: today, type: input.type, note: input.note, startAt: now, endAt: null });
      return { breakId };
    }

    if (open.length === 0) throw new DomainError("You're not on a break.", 409);
    for (const b of stale) tx.update(`breaks/${b.id}`, { endAt: endOfBreakDay(String(b.data.date)) });
    for (const b of current) tx.update(`breaks/${b.id}`, { endAt: now });
    return {};
  });
}

/** Nightly: close every break left open from an earlier day at the end of that day. Safe to run repeatedly. */
export function finalizeStaleBreaks(db: DocDb): Promise<{ closed: number }> {
  return db.transaction(async (tx) => {
    const today = pktDateString(db.now());
    const open = await tx.find("breaks", [["endAt", null]]);
    const stale = open.filter((b) => String(b.data.date) < today);
    for (const b of stale) tx.update(`breaks/${b.id}`, { endAt: endOfBreakDay(String(b.data.date)) });
    return { closed: stale.length };
  });
}

/* ------------------------------------ Leave ----------------------------------- */

type RequestDoc = { employeeId: string; fromDate: string; toDate: string; status: "pending" | "approved" | "rejected" | "cancelled" };

export function handleLeave(db: DocDb, actor: Actor, input: LeaveAction): Promise<{ requestId?: string }> {
  return db.transaction(async (tx) => {
    const now = db.now();

    if (input.action === "create") {
      requireEmployee(actor, "request leave");
      assertValidLeave(input, pktDateString(now));
      const pending = await tx.find("leaveRequests", [["employeeId", actor.uid], ["status", "pending"]]);
      if (pending.length >= MAX_PENDING_REQUESTS) throw new DomainError("You have a lot of requests waiting. Wait for a decision first.", 409);
      const me = (await tx.get(`users/${actor.uid}`)) as Doc | null;
      const requestId = db.newId();
      tx.create(`leaveRequests/${requestId}`, {
        employeeId: actor.uid, employeeName: actor.name, businessId: (me?.businessId as string | null) ?? null,
        kind: input.kind, fromDate: input.fromDate, toDate: input.toDate, fromTime: input.fromTime, toTime: input.toTime,
        reason: input.reason, status: "pending",
        decidedBy: null, decidedByName: null, decisionNote: "", decidedAt: null, createdAt: now,
      });
      queueNotification(db, tx, {
        toUid: ADMIN_MAILBOX,
        title: `${actor.name} asked for ${input.kind === "leave" ? "time off" : "a short excuse"}`,
        body: input.fromDate === input.toDate ? input.fromDate : `${input.fromDate} to ${input.toDate}`,
        link: "/admin/leave",
      });
      return { requestId };
    }

    const request = (await tx.get(`leaveRequests/${input.requestId}`)) as RequestDoc | null;
    // Employees only ever learn that their own requests exist.
    if (!request || (actor.role === "employee" && request.employeeId !== actor.uid)) throw new DomainError("That request doesn't exist.", 404);

    if (input.action === "cancel") {
      requireEmployee(actor, "cancel their requests");
      if (request.status !== "pending") throw new DomainError("Only a request that's still waiting can be cancelled.", 409);
      tx.update(`leaveRequests/${input.requestId}`, { status: "cancelled" });
      return {};
    }

    requireAdmin(actor, "decide on requests");
    if (request.status !== "pending") throw new DomainError(`That request was already ${request.status}.`, 409);
    if (input.decision === "reject" && input.note.length < 3) throw new DomainError("Tell them why (a few words is enough).", 400);
    tx.update(`leaveRequests/${input.requestId}`, {
      status: input.decision === "approve" ? "approved" : "rejected", decidedBy: actor.uid, decidedByName: actor.name, decisionNote: input.note, decidedAt: now,
    });
    queueNotification(db, tx, {
      toUid: request.employeeId,
      title: input.decision === "approve" ? "Your request was approved" : "Your request wasn't approved",
      body: input.note || (request.fromDate === request.toDate ? request.fromDate : `${request.fromDate} to ${request.toDate}`),
      link: "/me/leave",
    });
    return {};
  });
}
