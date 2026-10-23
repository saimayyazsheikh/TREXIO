import type { DocDb, DocTx, Notice } from "@/lib/server/communication";

export const ADMIN_MAILBOX = "admin";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Saves a notification inside the caller's transaction (so it exists exactly when the change does) and pushes it after commit. */
export function queueNotification(db: DocDb, tx: DocTx, n: Notice): void {
  const notice = { ...n, title: clip(n.title, 80), body: clip(n.body, 200) };
  tx.create(`notifications/${db.newId()}`, { ...notice, readAt: null, createdAt: db.now() });
  tx.afterCommit(() => db.push(notice));
}
