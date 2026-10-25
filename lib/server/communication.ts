import { DomainError } from "@/lib/domain/errors";
import { ADMIN_MAILBOX, queueNotification } from "@/lib/server/notify";
import type { Actor } from "@/lib/domain/tasks";
import {
  EVERYONE_CHAT, assertCanUseChat, bizChatId, dmChatId, isBusinessChat, questionStatusAfterReply, toggleReaction, unreadKey,
  type ChatAction, type QuestionAction, type ReminderInput, type ReminderResponse,
} from "@/lib/domain/communication";

type Doc = Record<string, unknown>;
type UserRec = { name: string; role: "admin" | "employee"; businessId: string | null; status: "active" | "disabled" };

/** One atomic transaction over documents addressed by path. Reads must come before writes. */
export type DocTx = {
  get(path: string): Promise<Doc | null>;
  /** Creates a document; the caller has already checked that it doesn't exist. */
  create(path: string, data: Doc): void;
  update(path: string, patch: Doc): void;
  /** Documents of a top-level collection whose fields all equal the given values (null matches a null field). */
  find(collection: string, filters: [field: string, value: string | number | boolean | null][], limit?: number): Promise<{ id: string; data: Doc }[]>;
  activeEmployees(): Promise<{ id: string; name: string; businessId: string | null }[]>;
  /** Runs once the transaction has committed (never for a failed or retried attempt). Failures are swallowed. */
  afterCommit(fn: () => Promise<void> | void): void;
};

/** What a person sees in the bell. `toUid` is a user id, or "admin" for the admin's shared mailbox. */
export type Notice = { toUid: string; title: string; body: string; link: string };

export type DocDb = {
  transaction<T>(fn: (tx: DocTx) => Promise<T>): Promise<T>;
  now(): Date;
  newId(): string;
  /** Sends a browser push for a notice that was saved. Best effort. */
  push(notice: Notice): Promise<void>;
};

const requireAdmin = (a: Actor, what: string) => {
  if (a.role !== "admin") throw new DomainError(`Only the admin can ${what}.`, 403);
};
const requireEmployee = (a: Actor, what: string) => {
  if (a.role !== "employee") throw new DomainError(`Only team members can ${what}.`, 403);
};

async function getUser(tx: DocTx, uid: string): Promise<UserRec | null> {
  return (await tx.get(`users/${uid}`)) as UserRec | null;
}

/* ---------------------------------- Reminders ---------------------------------- */

export function sendReminder(db: DocDb, actor: Actor, input: ReminderInput): Promise<{ id: string; recipients: number }> {
  return db.transaction(async (tx) => {
    requireAdmin(actor, "send reminders");
    if (await tx.get(`reminders/${input.id}`)) throw new DomainError("That reminder was already sent.", 409);

    const names: Record<string, string> = {};
    if (input.toAll) {
      for (const e of await tx.activeEmployees()) names[e.id] = e.name;
    } else {
      for (const uid of input.toUids) {
        const u = await getUser(tx, uid);
        if (!u || u.role !== "employee") throw new DomainError("One of the people you chose doesn't exist.", 400);
        if (u.status !== "active") throw new DomainError(`${u.name} is turned off. Remove them from the list.`, 409);
        names[uid] = u.name;
      }
    }
    const toUids = Object.keys(names);
    if (toUids.length === 0) throw new DomainError("There's nobody active to send it to yet.", 400);

    let taskTitle: string | null = null;
    if (input.taskId) {
      const task = await tx.get(`tasks/${input.taskId}`);
      if (!task) throw new DomainError("The linked task no longer exists.", 404);
      taskTitle = String(task.title);
    }

    tx.create(`reminders/${input.id}`, {
      fromUid: actor.uid, fromName: actor.name, toUids, toNames: names, body: input.body,
      taskId: input.taskId, taskTitle, readBy: {}, createdAt: db.now(),
    });
    for (const uid of toUids) queueNotification(db, tx, { toUid: uid, title: `Reminder from ${actor.name}`, body: input.body, link: "/me/reminders" });
    return { id: input.id, recipients: toUids.length };
  });
}

type ReminderRec = { toUids: string[]; body: string; readBy?: Record<string, Date>; doneBy?: Record<string, Date>; askedBy?: Record<string, string> };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * A team member answers a reminder: "Got it" (seen, and on it), "Complete" (the work is done), or "Ask" (opens a help thread in
 * Ask, linked to the reminder, so there can be two-way talk before it is finished). Each person's state is kept separately.
 */
export function respondToReminder(db: DocDb, actor: Actor, input: ReminderResponse): Promise<{ questionId?: string }> {
  return db.transaction(async (tx) => {
    requireEmployee(actor, "respond to reminders");
    const path = `reminders/${input.reminderId}`;
    const r = (await tx.get(path)) as ReminderRec | null;
    if (!r || !r.toUids.includes(actor.uid)) throw new DomainError("That reminder doesn't exist.", 404);
    const now = db.now();
    const readBy = { ...(r.readBy ?? {}) };
    const doneBy = { ...(r.doneBy ?? {}) };
    const askedBy = { ...(r.askedBy ?? {}) };
    if (!readBy[actor.uid]) readBy[actor.uid] = now;

    if (input.action === "seen") {
      if (!r.readBy?.[actor.uid]) tx.update(path, { readBy });
      return {};
    }

    if (input.action === "complete") {
      if (doneBy[actor.uid]) return {};
      doneBy[actor.uid] = now;
      tx.update(path, { readBy, doneBy });
      queueNotification(db, tx, { toUid: ADMIN_MAILBOX, title: `${actor.name} finished a reminder`, body: clip(r.body, 120), link: "/admin/reminders" });
      return {};
    }

    // ask: one open conversation per person per reminder
    const existing = askedBy[actor.uid];
    if (existing) {
      const q = (await tx.get(`questions/${existing}`)) as { status?: string } | null;
      if (q && q.status !== "closed") throw new DomainError("You already have a conversation open about this reminder. Find it in Ask.", 409);
    }
    const me = await getUser(tx, actor.uid);
    const questionId = db.newId();
    tx.create(`questions/${questionId}`, {
      employeeId: actor.uid, employeeName: actor.name, businessId: me?.businessId ?? null, taskId: null, taskTitle: null, subject: clip(`About a reminder: ${r.body}`, 120),
      reminderId: input.reminderId, reminderBody: clip(r.body, 300),
      status: "open", urgent: false, unreadForAdmin: true, unreadForEmployee: false, lastMessageAt: now, lastAuthorRole: "employee", createdAt: now,
    });
    tx.create(`questions/${questionId}/messages/${db.newId()}`, { authorId: actor.uid, authorName: actor.name, authorRole: "employee", body: input.body, createdAt: now });
    askedBy[actor.uid] = questionId;
    tx.update(path, { readBy, askedBy });
    queueNotification(db, tx, { toUid: ADMIN_MAILBOX, title: `Question about a reminder from ${actor.name}`, body: clip(input.body, 120), link: "/admin/inbox" });
    return { questionId };
  });
}

/* ---------------------------------- Questions ---------------------------------- */

type QuestionDoc = {
  employeeId: string; employeeName: string; status: "open" | "answered" | "closed"; unreadForAdmin: boolean; unreadForEmployee: boolean;
};

async function loadQuestion(tx: DocTx, questionId: string, actor: Actor): Promise<QuestionDoc> {
  const q = (await tx.get(`questions/${questionId}`)) as QuestionDoc | null;
  // Employees only ever learn that their own questions exist.
  if (!q || (actor.role === "employee" && q.employeeId !== actor.uid)) throw new DomainError("That question doesn't exist.", 404);
  return q;
}

export function handleQuestion(db: DocDb, actor: Actor, input: QuestionAction): Promise<unknown> {
  return db.transaction(async (tx) => {
    const now = db.now();

    if (input.action === "ask") {
      requireEmployee(actor, "ask questions");
      const me = await getUser(tx, actor.uid);
      let taskTitle: string | null = null;
      if (input.taskId) {
        const task = await tx.get(`tasks/${input.taskId}`);
        if (!task || !(task.assigneeIds as string[]).includes(actor.uid)) throw new DomainError("That task isn't one of yours.", 403);
        taskTitle = String(task.title);
      }
      const questionId = db.newId();
      tx.create(`questions/${questionId}`, {
        employeeId: actor.uid, employeeName: actor.name, businessId: me?.businessId ?? null, taskId: input.taskId, taskTitle, subject: input.subject,
        status: "open", urgent: input.urgent, unreadForAdmin: true, unreadForEmployee: false, lastMessageAt: now, lastAuthorRole: "employee", createdAt: now,
      });
      tx.create(`questions/${questionId}/messages/${db.newId()}`, { authorId: actor.uid, authorName: actor.name, authorRole: "employee", body: input.body, createdAt: now });
      queueNotification(db, tx, { toUid: ADMIN_MAILBOX, title: `${input.urgent ? "Urgent question" : "Question"} from ${actor.name}`, body: input.subject, link: "/admin/inbox" });
      return { questionId };
    }

    const q = await loadQuestion(tx, input.questionId, actor);

    if (input.action === "reply") {
      const status = questionStatusAfterReply(q.status, actor.role);
      const fromAdmin = actor.role === "admin";
      tx.update(`questions/${input.questionId}`, { status, lastMessageAt: now, lastAuthorRole: actor.role, unreadForAdmin: !fromAdmin, unreadForEmployee: fromAdmin });
      tx.create(`questions/${input.questionId}/messages/${db.newId()}`, { authorId: actor.uid, authorName: actor.name, authorRole: actor.role, body: input.body, createdAt: now });
      queueNotification(
        db,
        tx,
        fromAdmin
          ? { toUid: q.employeeId, title: "Your admin replied", body: input.body, link: "/me/ask" }
          : { toUid: ADMIN_MAILBOX, title: `${actor.name} replied`, body: input.body, link: "/admin/inbox" },
      );
      return { ok: true };
    }

    if (input.action === "status") {
      requireAdmin(actor, "close or reopen questions");
      if (q.status === input.status) throw new DomainError(`That question is already ${input.status}.`, 409);
      tx.update(`questions/${input.questionId}`, { status: input.status, unreadForAdmin: false });
      return { ok: true };
    }

    // seen: clears only the viewer's own unread flag
    tx.update(`questions/${input.questionId}`, actor.role === "admin" ? { unreadForAdmin: false } : { unreadForEmployee: false });
    return { ok: true };
  });
}

/* ------------------------------------ Chat ------------------------------------- */

type ChatDoc = { unread?: Record<string, number> };
type MessageDoc = { authorId: string; deleted?: boolean; reactions?: Record<string, string[]> };

const preview = (body: string) => (body.length > 80 ? `${body.slice(0, 80)}…` : body);

export function handleChat(db: DocDb, actor: Actor, input: ChatAction): Promise<unknown> {
  return db.transaction(async (tx) => {
    const me = actor.role === "employee" ? await getUser(tx, actor.uid) : null;
    assertCanUseChat(input.chatId, { ...actor, businessId: me?.businessId ?? null });
    const now = db.now();
    const chatPath = `chats/${input.chatId}`;

    if (input.action === "send") {

      const isEveryone = input.chatId === EVERYONE_CHAT;
      const isBusiness = isBusinessChat(input.chatId);
      const chat = (await tx.get(chatPath)) as ChatDoc | null;
      const everyEmployee = isEveryone || isBusiness ? await tx.activeEmployees() : [];
      let business: { id: string; name: string } | null = null;
      if (isBusiness) {
        const id = input.chatId.slice(4);
        const b = (await tx.get(`businesses/${id}`)) as { name?: string } | null;
        if (!b) throw new DomainError("That business doesn't exist.", 404);
        business = { id, name: String(b.name ?? "Business") };
      }
      const employees = isBusiness ? everyEmployee.filter((e) => e.businessId === business!.id) : everyEmployee;
      let dmEmployee: { id: string; name: string } | null = null;
      if (!isEveryone && !isBusiness) {
        const id = input.chatId.slice(3);
        const u = await getUser(tx, id);
        if (!u || u.role !== "employee") throw new DomainError("That team member doesn't exist.", 404);
        if (u.status !== "active") throw new DomainError(`${u.name} is turned off.`, 409);
        dmEmployee = { id, name: u.name };
      }

      const unread = { ...(chat?.unread ?? {}) };
      const bump = (key: string) => void (unread[key] = (unread[key] ?? 0) + 1);
      if (isEveryone || isBusiness) {
        for (const e of employees) if (e.id !== actor.uid) bump(e.id);
        if (actor.role !== "admin") bump("admin");
      } else {
        bump(actor.role === "admin" ? dmEmployee!.id : "admin");
      }

      const messageId = db.newId();
      const lastMessage = { text: preview(input.body), authorName: actor.name };
      if (chat) tx.update(chatPath, { lastMessage, lastAt: now, unread });
      else {
        tx.create(chatPath, {
          type: isEveryone || isBusiness ? "group" : "direct", title: isEveryone ? "Everyone" : isBusiness ? business!.name : dmEmployee!.name, employeeId: dmEmployee?.id ?? null, businessId: business?.id ?? null,
          lastMessage, lastAt: now, unread, createdAt: now,
        });
      }
      tx.create(`${chatPath}/messages/${messageId}`, {
        authorId: actor.uid, authorName: actor.name, authorRole: actor.role, body: input.body, reactions: {}, createdAt: now, editedAt: null, deleted: false,
      });
      return { messageId };
    }

    if (input.action === "read") {
      const chat = (await tx.get(chatPath)) as ChatDoc | null;
      const key = unreadKey(actor);
      if (chat && (chat.unread?.[key] ?? 0) !== 0) tx.update(chatPath, { unread: { ...chat.unread, [key]: 0 } });
      return { ok: true };
    }

    const message = (await tx.get(`${chatPath}/messages/${input.messageId}`)) as MessageDoc | null;
    if (!message || message.deleted) throw new DomainError("That message doesn't exist any more.", 404);
    const messagePath = `${chatPath}/messages/${input.messageId}`;

    if (input.action === "edit") {
      if (message.authorId !== actor.uid) throw new DomainError("You can only edit your own messages.", 403);
      tx.update(messagePath, { body: input.body, editedAt: now });
    } else if (input.action === "delete") {
      if (message.authorId !== actor.uid) throw new DomainError("You can only delete your own messages.", 403);
      tx.update(messagePath, { deleted: true, body: "", reactions: {}, editedAt: null });
    } else {
      tx.update(messagePath, { reactions: toggleReaction(message.reactions ?? {}, input.emoji, actor.uid) });
    }
    return { ok: true };
  });
}

export { bizChatId, dmChatId };
