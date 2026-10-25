import { beforeEach, describe, expect, it } from "vitest";
import { handleChat, handleQuestion, respondToReminder, sendReminder, type DocDb } from "@/lib/server/communication";
import { makeDocDb, seedDocs } from "@/lib/server/test-support/memory-doc-db";
import { chatActionSchema, questionActionSchema, reminderResponseSchema, reminderSchema } from "@/lib/domain/communication";
import type { Actor } from "@/lib/domain/tasks";

const now = new Date("2026-10-21T06:00:00Z");
const admin: Actor = { uid: "admin1", name: "Boss", role: "admin" };
const ali: Actor = { uid: "ali12345", name: "Ali Khan", role: "employee" };
const sara: Actor = { uid: "sara9999", name: "Sara Ahmed", role: "employee" };
const omar = (): Actor => ({ uid: "omar1234", name: "Omar Farooq", role: "employee" });


let docs: Map<string, Record<string, unknown>>;
let db: DocDb;
beforeEach(() => {
  docs = seedDocs();
  db = makeDocDb(docs, now);
});

describe("reminders", () => {
  const send = (over: Record<string, unknown> = {}) => reminderSchema.parse({ id: "rem0000001", body: "Send the report", toUids: ["ali12345"], ...over });

  it("creates a reminder with names, an empty read receipt and the task title", async () => {
    await expect(sendReminder(db, admin, send({ taskId: "t1" }))).resolves.toEqual({ id: "rem0000001", recipients: 1 });
    expect(docs.get("reminders/rem0000001")).toMatchObject({ fromUid: "admin1", toUids: ["ali12345"], toNames: { ali12345: "Ali Khan" }, taskTitle: "Count stock", readBy: {} });
  });
  it("'everyone' reaches every active employee and skips turned-off ones", async () => {
    const r = await sendReminder(db, admin, send({ toUids: [], toAll: true }));
    expect(r.recipients).toBe(2);
    expect(docs.get("reminders/rem0000001")?.toUids).toEqual(expect.arrayContaining(["ali12345", "sara9999"]));
    expect(docs.get("reminders/rem0000001")?.toUids).not.toContain("off11111");
  });
  it("is admin only and checks recipients, task and duplicates", async () => {
    await expect(sendReminder(db, ali, send())).rejects.toMatchObject({ status: 403 });
    await expect(sendReminder(db, admin, send({ toUids: ["off11111"] }))).rejects.toThrow(/turned off/);
    await expect(sendReminder(db, admin, send({ toUids: ["admin1"] }))).rejects.toThrow(/doesn't exist/);
    await expect(sendReminder(db, admin, send({ taskId: "nope" }))).rejects.toMatchObject({ status: 404 });
    await sendReminder(db, admin, send());
    await expect(sendReminder(db, admin, send())).rejects.toMatchObject({ status: 409 });
  });
  it("tells you when nobody is active", async () => {
    for (const [p, d] of docs) if (p.startsWith("users/") && d.role === "employee") d.status = "disabled";
    await expect(sendReminder(db, admin, send({ toUids: [], toAll: true }))).rejects.toThrow(/nobody active/);
  });
});

describe("answering a reminder", () => {
  const respond = (over: Record<string, unknown>) => reminderResponseSchema.parse({ reminderId: "rem0000001", ...over });
  beforeEach(async () => {
    await sendReminder(db, admin, reminderSchema.parse({ id: "rem0000001", body: "Match the ledger with Khan", toUids: ["ali12345", "sara9999"] }));
  });

  it("'Got it' records only that person, and saying it twice changes nothing", async () => {
    await respondToReminder(db, ali, respond({ action: "seen" }));
    const first = (docs.get("reminders/rem0000001")!.readBy as Record<string, unknown>).ali12345;
    expect(first).toBeInstanceOf(Date);
    expect(docs.get("reminders/rem0000001")!.readBy).not.toHaveProperty("sara9999");
    await respondToReminder(db, ali, respond({ action: "seen" }));
    expect((docs.get("reminders/rem0000001")!.readBy as Record<string, unknown>).ali12345).toBe(first);
  });

  it("completing marks it seen too, tells the admin once, and keeps teammates' states apart", async () => {
    await respondToReminder(db, ali, respond({ action: "complete" }));
    await respondToReminder(db, ali, respond({ action: "complete" }));
    const r = docs.get("reminders/rem0000001")!;
    expect(r.doneBy).toHaveProperty("ali12345");
    expect(r.doneBy).not.toHaveProperty("sara9999");
    expect(r.readBy).toHaveProperty("ali12345");
    const told = [...docs].filter(([p, d]) => p.startsWith("notifications/") && d.toUid === "admin" && String(d.title).includes("finished a reminder"));
    expect(told).toHaveLength(1);
  });

  it("asking opens a linked thread in Ask with the person's question, once while it is open", async () => {
    const { questionId } = await respondToReminder(db, ali, respond({ action: "ask", body: "Which Khan?" }));
    expect(docs.get(`questions/${questionId}`)).toMatchObject({ employeeId: "ali12345", status: "open", unreadForAdmin: true, reminderId: "rem0000001", reminderBody: "Match the ledger with Khan" });
    expect(docs.get("reminders/rem0000001")!.askedBy).toEqual({ ali12345: questionId });
    expect(docs.get("reminders/rem0000001")!.readBy).toHaveProperty("ali12345");
    const messages = [...docs].filter(([p]) => p.startsWith(`questions/${questionId}/messages/`));
    expect(messages[0][1]).toMatchObject({ body: "Which Khan?", authorRole: "employee" });
    await expect(respondToReminder(db, ali, respond({ action: "ask", body: "Again?" }))).rejects.toMatchObject({ status: 409 });
    docs.get(`questions/${questionId}`)!.status = "closed";
    await expect(respondToReminder(db, ali, respond({ action: "ask", body: "One more thing" }))).resolves.toHaveProperty("questionId");
  });

  it("is for the people it was sent to, and for team members only", async () => {
    await expect(respondToReminder(db, admin, respond({ action: "seen" }))).rejects.toMatchObject({ status: 403 });
    docs.get("reminders/rem0000001")!.toUids = ["sara9999"];
    await expect(respondToReminder(db, ali, respond({ action: "seen" }))).rejects.toMatchObject({ status: 404 });
    await expect(respondToReminder(db, ali, respond({ action: "seen", reminderId: "nope" }))).rejects.toMatchObject({ status: 404 });
  });
});

describe("questions", () => {
  const ask = (over: Record<string, unknown> = {}) => questionActionSchema.parse({ action: "ask", subject: "Printer jams", body: "It jams on page 2", ...over });
  const reply = (questionId: string, over: Record<string, unknown> = {}) => questionActionSchema.parse({ action: "reply", questionId, body: "Try the other tray", ...over });
  let qid: string;
  beforeEach(async () => {
    qid = ((await handleQuestion(db, ali, ask({ urgent: true, taskId: "t1" }))) as { questionId: string }).questionId;
  });

  it("asking opens a thread with the first message and flags it for the admin", () => {
    expect(docs.get(`questions/${qid}`)).toMatchObject({ employeeId: "ali12345", status: "open", urgent: true, taskTitle: "Count stock", unreadForAdmin: true, unreadForEmployee: false, businessId: "b1" });
    const messages = [...docs].filter(([p]) => p.startsWith(`questions/${qid}/messages/`));
    expect(messages).toHaveLength(1);
    expect(messages[0][1]).toMatchObject({ authorRole: "employee", body: "It jams on page 2" });
  });
  it("only employees ask, and only about their own tasks", async () => {
    await expect(handleQuestion(db, admin, ask())).rejects.toMatchObject({ status: 403 });
    await expect(handleQuestion(db, sara, ask({ taskId: "t1" }))).rejects.toThrow(/isn't one of yours/);
  });
  it("the admin's reply marks it answered and flags it for the employee; the employee's reply reopens it", async () => {
    await handleQuestion(db, admin, reply(qid));
    expect(docs.get(`questions/${qid}`)).toMatchObject({ status: "answered", unreadForEmployee: true, unreadForAdmin: false, lastAuthorRole: "admin" });
    await handleQuestion(db, ali, reply(qid, { body: "That worked, thanks" }));
    expect(docs.get(`questions/${qid}`)).toMatchObject({ status: "open", unreadForAdmin: true, unreadForEmployee: false });
  });
  it("a reply needs text", () => {
    expect(questionActionSchema.safeParse({ action: "reply", questionId: qid, body: "   " }).success).toBe(false);
  });
  it("other employees can't see, reply to or mark seen someone else's question", async () => {
    await expect(handleQuestion(db, sara, reply(qid))).rejects.toMatchObject({ status: 404 });
    await expect(handleQuestion(db, sara, questionActionSchema.parse({ action: "seen", questionId: qid }))).rejects.toMatchObject({ status: 404 });
  });
  it("closing is admin only, blocks replies, and reopening restores it", async () => {
    const status = (s: "open" | "closed") => questionActionSchema.parse({ action: "status", questionId: qid, status: s });
    await expect(handleQuestion(db, ali, status("closed"))).rejects.toMatchObject({ status: 403 });
    await handleQuestion(db, admin, status("closed"));
    await expect(handleQuestion(db, ali, reply(qid))).rejects.toThrow(/closed/);
    await expect(handleQuestion(db, admin, status("closed"))).rejects.toMatchObject({ status: 409 });
    await handleQuestion(db, admin, status("open"));
    await expect(handleQuestion(db, ali, reply(qid))).resolves.toBeTruthy();
  });
  it("'seen' clears only the viewer's own flag", async () => {
    await handleQuestion(db, admin, reply(qid)); // employee now has an unread answer
    await handleQuestion(db, ali, questionActionSchema.parse({ action: "seen", questionId: qid }));
    expect(docs.get(`questions/${qid}`)).toMatchObject({ unreadForEmployee: false });
    await handleQuestion(db, ali, reply(qid, { body: "ok" }));
    await handleQuestion(db, admin, questionActionSchema.parse({ action: "seen", questionId: qid }));
    expect(docs.get(`questions/${qid}`)).toMatchObject({ unreadForAdmin: false });
  });
});

describe("chat", () => {
  const send = (chatId: string, body = "hello") => chatActionSchema.parse({ action: "send", chatId, body });
  const act = (a: Record<string, unknown>) => chatActionSchema.parse(a);
  const messages = (chatId: string) => [...docs].filter(([p]) => p.startsWith(`chats/${chatId}/messages/`));
  const unread = (chatId: string) => (docs.get(`chats/${chatId}`)?.unread ?? {}) as Record<string, number>;

  it("a direct message creates the chat and counts unread for the other side only", async () => {
    await handleChat(db, ali, send("dm_ali12345"));
    expect(docs.get("chats/dm_ali12345")).toMatchObject({ type: "direct", title: "Ali Khan", employeeId: "ali12345", lastMessage: { text: "hello", authorName: "Ali Khan" } });
    expect(unread("dm_ali12345")).toEqual({ admin: 1 });
    await handleChat(db, admin, send("dm_ali12345", "hi Ali"));
    expect(unread("dm_ali12345")).toEqual({ admin: 1, ali12345: 1 });
    expect(messages("dm_ali12345")).toHaveLength(2);
  });
  it("Everyone counts unread for the other active employees and the admin, never the sender or turned-off people", async () => {
    await handleChat(db, ali, send("everyone"));
    expect(unread("everyone")).toEqual({ sara9999: 1, admin: 1 });
    await handleChat(db, admin, send("everyone", "morning all"));
    expect(unread("everyone")).toEqual({ sara9999: 2, admin: 1, ali12345: 1 });
  });
  it("employees can only use Everyone and their own direct chat", async () => {
    await expect(handleChat(db, ali, send("dm_sara9999"))).rejects.toMatchObject({ status: 403 });
    await expect(handleChat(db, ali, act({ action: "read", chatId: "dm_sara9999" }))).rejects.toMatchObject({ status: 403 });
    await expect(handleChat(db, admin, send("dm_off11111"))).rejects.toThrow(/turned off/);
    await expect(handleChat(db, admin, send("dm_ghost0000"))).rejects.toMatchObject({ status: 404 });
  });
  describe("business rooms", () => {
    beforeEach(() => {
      docs.set("users/omar1234", { name: "Omar Farooq", role: "employee", status: "active", businessId: "b2" });
      docs.set("businesses/b2", { name: "Beta Foods" });
    });

    it("a message in a business room reaches that business's team and the admin, and nobody else", async () => {
      await handleChat(db, ali, send("biz_b1", "Stock arrives at 3"));
      expect(docs.get("chats/biz_b1")).toMatchObject({ type: "group", title: "Alpha Traders", businessId: "b1", lastMessage: { text: "Stock arrives at 3", authorName: "Ali Khan" } });
      expect(unread("biz_b1")).toEqual({ sara9999: 1, admin: 1 });
      await handleChat(db, admin, send("biz_b2", "Welcome Beta"));
      expect(docs.get("chats/biz_b2")).toMatchObject({ title: "Beta Foods" });
      expect(unread("biz_b2")).toEqual({ omar1234: 1 });
    });

    it("employees only use their own business's room", async () => {
      await expect(handleChat(db, ali, send("biz_b2"))).rejects.toMatchObject({ status: 403 });
      await expect(handleChat(db, omar(), send("biz_b1"))).rejects.toMatchObject({ status: 403 });
      await expect(handleChat(db, ali, act({ action: "read", chatId: "biz_b2" }))).rejects.toMatchObject({ status: 403 });
      await expect(handleChat(db, admin, send("biz_nope0000"))).rejects.toMatchObject({ status: 404 });
    });
  });

  it("a message needs text", () => {
    expect(chatActionSchema.safeParse({ action: "send", chatId: "everyone", body: "   " }).success).toBe(false);
  });
  it("marking read resets only your own counter", async () => {
    await handleChat(db, ali, send("everyone"));
    await handleChat(db, admin, act({ action: "read", chatId: "everyone" }));
    expect(unread("everyone")).toEqual({ sara9999: 1, admin: 0 });
  });

  describe("editing, deleting and reacting", () => {
    let mid: string;
    beforeEach(async () => {
      mid = ((await handleChat(db, ali, send("everyone", "first draft"))) as { messageId: string }).messageId;
    });
    const path = () => `chats/everyone/messages/${mid}`;

    it("only the author edits or deletes; edits are stamped and deletes wipe the content", async () => {
      await expect(handleChat(db, sara, act({ action: "edit", chatId: "everyone", messageId: mid, body: "hacked" }))).rejects.toMatchObject({ status: 403 });
      await expect(handleChat(db, admin, act({ action: "delete", chatId: "everyone", messageId: mid }))).rejects.toMatchObject({ status: 403 });
      await handleChat(db, ali, act({ action: "edit", chatId: "everyone", messageId: mid, body: "final text" }));
      expect(docs.get(path())).toMatchObject({ body: "final text", editedAt: now });
      await handleChat(db, ali, act({ action: "delete", chatId: "everyone", messageId: mid }));
      expect(docs.get(path())).toMatchObject({ deleted: true, body: "" });
      await expect(handleChat(db, ali, act({ action: "edit", chatId: "everyone", messageId: mid, body: "again" }))).rejects.toMatchObject({ status: 404 });
    });
    it("anyone in the chat can react; reacting twice removes it", async () => {
      await handleChat(db, sara, act({ action: "react", chatId: "everyone", messageId: mid, emoji: "👍" }));
      await handleChat(db, admin, act({ action: "react", chatId: "everyone", messageId: mid, emoji: "👍" }));
      expect(docs.get(path())?.reactions).toEqual({ "👍": ["sara9999", "admin1"] });
      await handleChat(db, sara, act({ action: "react", chatId: "everyone", messageId: mid, emoji: "👍" }));
      expect(docs.get(path())?.reactions).toEqual({ "👍": ["admin1"] });
    });
    it("can't touch messages in a chat you can't use", async () => {
      await expect(handleChat(db, ali, act({ action: "react", chatId: "dm_sara9999", messageId: mid, emoji: "👍" }))).rejects.toMatchObject({ status: 403 });
    });
  });
});
