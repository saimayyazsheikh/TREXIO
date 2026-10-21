import { describe, expect, it } from "vitest";
import {
  attachmentsInFolder, canUseChat, chatActionSchema, dmChatId, questionActionSchema, questionStatusAfterReply, reminderSchema, toggleReaction, unreadKey,
} from "@/lib/domain/communication";

const ali = { uid: "ali12345", role: "employee" as const };
const admin = { uid: "admin1", role: "admin" as const };

describe("reminderSchema", () => {
  const base = { id: "abcdefghij1", body: "  Please send the report  ", toUids: ["a", "a", "b"] };
  it("trims, dedupes recipients and defaults optional fields", () => {
    const r = reminderSchema.parse(base);
    expect(r).toMatchObject({ body: "Please send the report", toUids: ["a", "b"], toAll: false, taskId: null, attachments: [] });
  });
  it("needs a recipient or 'everyone', and a message", () => {
    expect(reminderSchema.safeParse({ ...base, toUids: [] }).success).toBe(false);
    expect(reminderSchema.safeParse({ ...base, toUids: [], toAll: true }).success).toBe(true);
    expect(reminderSchema.safeParse({ ...base, body: "   " }).success).toBe(false);
  });
  it("rejects odd ids", () => expect(reminderSchema.safeParse({ ...base, id: "../x" }).success).toBe(false));
  it("accepts local emulator and https attachment links but not other http links", () => {
    const file = (url: string) => ({ ...base, attachments: [{ name: "a.pdf", url, size: 10, type: "application/pdf" }] });
    expect(reminderSchema.safeParse(file("https://firebasestorage.googleapis.com/v0/b/x/o/a")).success).toBe(true);
    expect(reminderSchema.safeParse(file("http://127.0.0.1:9199/v0/b/x/o/a")).success).toBe(true);
    expect(reminderSchema.safeParse(file("http://evil.example/a")).success).toBe(false);
  });
});

describe("questionActionSchema", () => {
  it("validates asking, replying, status and seen", () => {
    expect(questionActionSchema.safeParse({ action: "ask", subject: "Printer?", body: "It jams" }).success).toBe(true);
    expect(questionActionSchema.safeParse({ action: "ask", subject: "x", body: "It jams" }).success).toBe(false);
    expect(questionActionSchema.safeParse({ action: "reply", questionId: "q1", body: "Thanks" }).success).toBe(true);
    expect(questionActionSchema.safeParse({ action: "status", questionId: "q1", status: "answered" }).success).toBe(false);
    expect(questionActionSchema.safeParse({ action: "seen", questionId: "q1" }).success).toBe(true);
    expect(questionActionSchema.safeParse({ action: "nope" }).success).toBe(false);
  });
});

describe("chatActionSchema", () => {
  it("only accepts the Everyone chat and direct chats", () => {
    expect(chatActionSchema.safeParse({ action: "send", chatId: "everyone", body: "hi" }).success).toBe(true);
    expect(chatActionSchema.safeParse({ action: "send", chatId: "dm_abc12345", body: "hi" }).success).toBe(true);
    expect(chatActionSchema.safeParse({ action: "send", chatId: "other", body: "hi" }).success).toBe(false);
    expect(chatActionSchema.safeParse({ action: "send", chatId: "dm_../x", body: "hi" }).success).toBe(false);
  });
  it("only allows the quick reactions, and rejects empty edits", () => {
    expect(chatActionSchema.safeParse({ action: "react", chatId: "everyone", messageId: "m1", emoji: "👍" }).success).toBe(true);
    expect(chatActionSchema.safeParse({ action: "react", chatId: "everyone", messageId: "m1", emoji: "💩" }).success).toBe(false);
    expect(chatActionSchema.safeParse({ action: "edit", chatId: "everyone", messageId: "m1", body: "  " }).success).toBe(false);
  });
});

describe("chat access", () => {
  it("employees get Everyone and their own direct chat only; the admin gets all", () => {
    expect(canUseChat("everyone", ali)).toBe(true);
    expect(canUseChat(dmChatId("ali12345"), ali)).toBe(true);
    expect(canUseChat(dmChatId("sara9999"), ali)).toBe(false);
    expect(canUseChat(dmChatId("sara9999"), admin)).toBe(true);
  });
  it("keys unread counters by uid, or 'admin' for the admin", () => {
    expect(unreadKey(ali)).toBe("ali12345");
    expect(unreadKey(admin)).toBe("admin");
  });
});

describe("toggleReaction", () => {
  it("adds, removes and cleans up empty reactions", () => {
    const one = toggleReaction({}, "👍", "a");
    expect(one).toEqual({ "👍": ["a"] });
    expect(toggleReaction(one, "👍", "b")).toEqual({ "👍": ["a", "b"] });
    expect(toggleReaction(one, "👍", "a")).toEqual({});
  });
});

describe("questionStatusAfterReply", () => {
  it("admin replies mark it answered; employee replies reopen it", () => {
    expect(questionStatusAfterReply("open", "admin")).toBe("answered");
    expect(questionStatusAfterReply("answered", "employee")).toBe("open");
  });
  it("closed threads reject replies", () => {
    expect(() => questionStatusAfterReply("closed", "employee")).toThrow(/closed/);
    expect(() => questionStatusAfterReply("closed", "admin")).toThrow(/closed/);
  });
});

describe("attachmentsInFolder", () => {
  const url = (uid: string) => `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(`u/${uid}/q/abc/file.pdf`)}?alt=media&token=t`;
  it("accepts files in the expected folder only", () => {
    expect(attachmentsInFolder([{ url: url("ali12345") }], "u/ali12345/")).toBe(true);
    expect(attachmentsInFolder([{ url: url("sara9999") }], "u/ali12345/")).toBe(false);
    expect(attachmentsInFolder([], "u/ali12345/")).toBe(true);
  });
});
