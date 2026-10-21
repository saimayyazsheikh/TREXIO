import { DomainError } from "@/lib/domain/errors";
import type { Actor } from "@/lib/domain/tasks";
import {
  EVERYONE_CHAT, assertCanUseChat, attachmentsInFolder, dmChatId, questionStatusAfterReply, toggleReaction, unreadKey,
  type ChatAction, type QuestionAction, type ReminderInput,
} from "@/lib/domain/communication";

type Doc = Record<string, unknown>;
type Attachments = { name: string; url: string; size: number; type: string }[];
type UserRec = { name: string; role: "admin" | "employee"; businessId: string | null; status: "active" | "disabled" };

/** One atomic transaction over documents addressed by path. Reads must come before writes. */
export type DocTx = {
  get(path: string): Promise<Doc | null>;
  /** Creates a document; the caller has already checked that it doesn't exist. */
  create(path: string, data: Doc): void;
  update(path: string, patch: Doc): void;
  /** Documents of a top-level collection whose fields all equal the given values (null matches a null field). */
  find(collection: string, filters: [field: string, value: string | number | boolean | null][], limit?: number): Promise<{ id: string; data: Doc }[]>;
  activeEmployees(): Promise<{ id: string; name: string }[]>;
};

export type DocDb = {
  transaction<T>(fn: (tx: DocTx) => Promise<T>): Promise<T>;
  now(): Date;
  newId(): string;
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
      fromUid: actor.uid, fromName: actor.name, toUids, toNames: names, body: input.body, attachments: input.attachments,
      taskId: input.taskId, taskTitle, readBy: {}, createdAt: db.now(),
    });
    return { id: input.id, recipients: toUids.length };
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
      if (!attachmentsInFolder(input.attachments, `u/${actor.uid}/`)) throw new DomainError("Those files can't be attached.", 400);
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
      tx.create(`questions/${questionId}/messages/${db.newId()}`, { authorId: actor.uid, authorName: actor.name, authorRole: "employee", body: input.body, attachments: input.attachments, createdAt: now });
      return { questionId };
    }

    const q = await loadQuestion(tx, input.questionId, actor);

    if (input.action === "reply") {
      if (!input.body && input.attachments.length === 0) throw new DomainError("Write a reply or attach a file.", 400);
      // Everyone in a thread uploads into the employee's private folder, which only they and the admin can read.
      if (!attachmentsInFolder(input.attachments, `u/${q.employeeId}/`)) throw new DomainError("Those files can't be attached.", 400);
      const status = questionStatusAfterReply(q.status, actor.role);
      const fromAdmin = actor.role === "admin";
      tx.update(`questions/${input.questionId}`, { status, lastMessageAt: now, lastAuthorRole: actor.role, unreadForAdmin: !fromAdmin, unreadForEmployee: fromAdmin });
      tx.create(`questions/${input.questionId}/messages/${db.newId()}`, { authorId: actor.uid, authorName: actor.name, authorRole: actor.role, body: input.body, attachments: input.attachments, createdAt: now });
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

const preview = (body: string) => (body.length > 80 ? `${body.slice(0, 80)}…` : body || "Sent an attachment");

export function handleChat(db: DocDb, actor: Actor, input: ChatAction): Promise<unknown> {
  return db.transaction(async (tx) => {
    assertCanUseChat(input.chatId, actor);
    const now = db.now();
    const chatPath = `chats/${input.chatId}`;

    if (input.action === "send") {
      if (!input.body && input.attachments.length === 0) throw new DomainError("Write a message or attach a file.", 400);
      if (!attachmentsInFolder(input.attachments, `chats/${input.chatId}/`)) throw new DomainError("Those files can't be attached.", 400);

      const isEveryone = input.chatId === EVERYONE_CHAT;
      const chat = (await tx.get(chatPath)) as ChatDoc | null;
      const employees = isEveryone ? await tx.activeEmployees() : [];
      let dmEmployee: { id: string; name: string } | null = null;
      if (!isEveryone) {
        const id = input.chatId.slice(3);
        const u = await getUser(tx, id);
        if (!u || u.role !== "employee") throw new DomainError("That team member doesn't exist.", 404);
        if (u.status !== "active") throw new DomainError(`${u.name} is turned off.`, 409);
        dmEmployee = { id, name: u.name };
      }

      const unread = { ...(chat?.unread ?? {}) };
      const bump = (key: string) => void (unread[key] = (unread[key] ?? 0) + 1);
      if (isEveryone) {
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
          type: isEveryone ? "group" : "direct", title: isEveryone ? "Everyone" : dmEmployee!.name, employeeId: dmEmployee?.id ?? null,
          lastMessage, lastAt: now, unread, createdAt: now,
        });
      }
      tx.create(`${chatPath}/messages/${messageId}`, {
        authorId: actor.uid, authorName: actor.name, authorRole: actor.role, body: input.body, attachments: input.attachments, reactions: {}, createdAt: now, editedAt: null, deleted: false,
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
      tx.update(messagePath, { deleted: true, body: "", attachments: [], reactions: {}, editedAt: null });
    } else {
      tx.update(messagePath, { reactions: toggleReaction(message.reactions ?? {}, input.emoji, actor.uid) });
    }
    return { ok: true };
  });
}

export { dmChatId };
export type { Attachments };
