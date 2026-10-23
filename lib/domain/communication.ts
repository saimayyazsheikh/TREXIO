import { z } from "zod";
import type { Role } from "@/lib/domain/constants";
import { DomainError } from "@/lib/domain/errors";

/** Quick emoji reactions on chat messages. */
export const REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏", "👀"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const MAX_BODY = 4000;
export const EVERYONE_CHAT = "everyone";
/** Chat unread counters are keyed by employee uid, and by this literal for the single admin. */
export const ADMIN_UNREAD_KEY = "admin";

const id = z.string().min(1).max(60);
/** Minted in the browser, so sending the same reminder twice (a double click) is recognised and refused. */
const clientId = z.string().regex(/^[A-Za-z0-9]{10,40}$/, "Invalid id");

/* ---------- Reminders (admin -> employees) ---------- */

export const reminderSchema = z
  .object({
    id: clientId,
    body: z.string().trim().min(1, "Write a message").max(2000, "Keep it under 2000 characters"),
    toUids: z.array(id).max(200).default([]).transform((ids) => [...new Set(ids)]),
    toAll: z.boolean().default(false),
    taskId: id.nullable().default(null),
  })
  .refine((r) => r.toAll || r.toUids.length > 0, { path: ["toUids"], message: "Choose who should get it" });
export type ReminderInput = z.infer<typeof reminderSchema>;

/* ---------- Questions (employee -> admin, a formal help thread) ---------- */

export const questionActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ask"),
    subject: z.string().trim().min(3, "Give it a short subject").max(120, "Keep the subject under 120 characters"),
    body: z.string().trim().min(1, "Describe what you need").max(MAX_BODY),
    urgent: z.boolean().default(false),
    taskId: id.nullable().default(null),
  }),
  z.object({
    action: z.literal("reply"),
    questionId: id,
    body: z.string().trim().min(1, "Write a reply").max(MAX_BODY),
  }),
  z.object({ action: z.literal("status"), questionId: id, status: z.enum(["open", "closed"]) }),
  z.object({ action: z.literal("seen"), questionId: id }),
]);
export type QuestionAction = z.infer<typeof questionActionSchema>;

/* ---------- Chat ---------- */

export const chatIdSchema = z.string().regex(/^(everyone|dm_[A-Za-z0-9]{6,40})$/, "Unknown chat");

export const chatActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), chatId: chatIdSchema, body: z.string().trim().min(1, "Write a message").max(MAX_BODY) }),
  z.object({ action: z.literal("read"), chatId: chatIdSchema }),
  z.object({ action: z.literal("edit"), chatId: chatIdSchema, messageId: id, body: z.string().trim().min(1, "A message can't be empty").max(MAX_BODY) }),
  z.object({ action: z.literal("delete"), chatId: chatIdSchema, messageId: id }),
  z.object({ action: z.literal("react"), chatId: chatIdSchema, messageId: id, emoji: z.enum(REACTIONS) }),
]);
export type ChatAction = z.infer<typeof chatActionSchema>;

/* ---------- Pure rules ---------- */

export const dmChatId = (employeeUid: string) => `dm_${employeeUid}`;

/** Who may use which chat: the admin everywhere, an employee only in Everyone and their own direct chat. */
export function canUseChat(chatId: string, actor: { uid: string; role: Role }): boolean {
  if (actor.role === "admin") return true;
  return chatId === EVERYONE_CHAT || chatId === dmChatId(actor.uid);
}

export function assertCanUseChat(chatId: string, actor: { uid: string; role: Role }) {
  if (!canUseChat(chatId, actor)) throw new DomainError("You don't have access to that chat.", 403);
}

export const unreadKey = (actor: { uid: string; role: Role }) => (actor.role === "admin" ? ADMIN_UNREAD_KEY : actor.uid);

/** Toggles `uid` in the reactors of an emoji; empty reactions disappear. */
export function toggleReaction(reactions: Record<string, string[]>, emoji: string, uid: string): Record<string, string[]> {
  const current = reactions[emoji] ?? [];
  const next = current.includes(uid) ? current.filter((u) => u !== uid) : [...current, uid];
  const out = { ...reactions };
  if (next.length === 0) delete out[emoji];
  else out[emoji] = next;
  return out;
}

/** Next status of a question after someone replies. Closed threads stay closed until the admin reopens them. */
export function questionStatusAfterReply(current: "open" | "answered" | "closed", role: Role): "open" | "answered" {
  if (current === "closed") throw new DomainError("This question is closed. Ask a new one if you still need help.", 409);
  return role === "admin" ? "answered" : "open";
}
