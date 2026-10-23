import { beforeEach, describe, expect, it } from "vitest";
import { handleQuestion, sendReminder, type DocDb, type Notice } from "@/lib/server/communication";
import { handleLeave } from "@/lib/server/time-off";
import { queueNotification } from "@/lib/server/notify";
import { makeDocDb, seedDocs } from "@/lib/server/test-support/memory-doc-db";
import { questionActionSchema, reminderSchema } from "@/lib/domain/communication";
import { leaveActionSchema } from "@/lib/domain/timeoff";
import type { Actor } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T08:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali12345", name: "Ali Khan", role: "employee" };

let docs: Map<string, Record<string, unknown>>;
let pushed: Notice[];
let db: DocDb;
beforeEach(() => {
  docs = seedDocs();
  pushed = [];
  db = makeDocDb(docs, now, pushed);
});
const saved = () => [...docs].filter(([p]) => p.startsWith("notifications/")).map(([, d]) => d);

describe("notifications", () => {
  it("a reminder notifies each recipient, unread, and pushes it after saving", async () => {
    await sendReminder(db, admin, reminderSchema.parse({ id: "rem0000001", body: "Send the report", toUids: [], toAll: true }));
    expect(saved().map((n) => n.toUid).sort()).toEqual(["ali12345", "sara9999"]);
    expect(saved()[0]).toMatchObject({ title: "Reminder from Boss", body: "Send the report", link: "/me/reminders", readAt: null, createdAt: now });
    expect(pushed).toHaveLength(2);
  });

  it("a failed change leaves no notification and sends no push", async () => {
    await expect(sendReminder(db, admin, reminderSchema.parse({ id: "rem0000001", body: "x", toUids: ["nobody"] }))).rejects.toBeTruthy();
    expect(saved()).toHaveLength(0);
    expect(pushed).toHaveLength(0);
  });

  it("a leave request goes to the admin mailbox, and the decision comes back to the employee", async () => {
    const { requestId } = await handleLeave(db, ali, leaveActionSchema.parse({ action: "create", kind: "leave", fromDate: "2026-10-22", toDate: "2026-10-23", reason: "Family event" }));
    expect(saved()).toHaveLength(1);
    expect(saved()[0]).toMatchObject({ toUid: "admin", link: "/admin/leave", body: "2026-10-22 to 2026-10-23" });
    await handleLeave(db, admin, leaveActionSchema.parse({ action: "decide", requestId, decision: "approve", note: "" }));
    expect(pushed.at(-1)).toMatchObject({ toUid: "ali12345", title: "Your request was approved", link: "/me/leave" });
  });

  it("questions notify the other side only", async () => {
    const asked = (await handleQuestion(db, ali, questionActionSchema.parse({ action: "ask", subject: "Printer jam", body: "It is stuck", urgent: true }))) as { questionId: string };
    expect(pushed.at(-1)).toMatchObject({ toUid: "admin", title: "Urgent question from Ali Khan", body: "Printer jam" });
    await handleQuestion(db, admin, questionActionSchema.parse({ action: "reply", questionId: asked.questionId, body: "On my way" }));
    expect(pushed.at(-1)).toMatchObject({ toUid: "ali12345", title: "Your admin replied", link: "/me/ask" });
    expect(pushed).toHaveLength(2);
  });

  it("long text is shortened so a bell row stays readable", async () => {
    await db.transaction(async (tx) => queueNotification(db, tx, { toUid: "ali12345", title: "t".repeat(200), body: "b".repeat(500), link: "/me" }));
    const n = saved()[0] as { title: string; body: string };
    expect(n.title.length).toBe(80);
    expect(n.body.length).toBe(200);
  });
});
