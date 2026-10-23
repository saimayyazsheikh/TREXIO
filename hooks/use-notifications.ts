"use client";

import { useCallback, useMemo } from "react";
import { collection, doc, limit, orderBy, query, serverTimestamp, updateDoc, where, type Timestamp } from "firebase/firestore";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import type { Role } from "@/lib/domain/constants";

export type NotificationDoc = { toUid: string; title: string; body: string; link: string; readAt: Timestamp | null; createdAt: Timestamp };

const SHOWN = 30;

/** The bell's contents: the admin reads the shared "admin" mailbox, an employee their own. */
export function useNotifications(viewer: { uid: string; role: Role }) {
  const { db } = getFirebase();
  const mailbox = viewer.role === "admin" ? "admin" : viewer.uid;
  const q = useMemo(() => query(collection(db, "notifications"), where("toUid", "==", mailbox), orderBy("createdAt", "desc"), limit(SHOWN)), [db, mailbox]);
  const list = useCollection<NotificationDoc>(q);

  const unread = useMemo(() => (list.data ?? []).filter((n) => !n.readAt), [list.data]);

  const markRead = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => updateDoc(doc(db, "notifications", id), { readAt: serverTimestamp() }).catch(() => undefined)));
    },
    [db],
  );

  return { ...list, unread, markRead };
}
