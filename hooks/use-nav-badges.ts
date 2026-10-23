"use client";

import { useMemo } from "react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { useCollection } from "@/hooks/use-collection";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { EVERYONE_CHAT, dmChatId, unreadKey } from "@/lib/domain/communication";
import type { Role } from "@/lib/domain/constants";
import type { ChatDoc, LeaveRequestDoc, QuestionDoc, ReminderDoc } from "@/types/models";

/** Live unread counts keyed by nav href: questions waiting, unread chat, unread reminders. */
export function useNavBadges(viewer: { uid: string; role: Role }): Record<string, number> {
  const { db } = getFirebase();
  const isAdmin = viewer.role === "admin";
  const key = unreadKey(viewer);

  const adminQuestionsQ = useMemo(() => (isAdmin ? query(orgCollection(db, "questions"), where("unreadForAdmin", "==", true)) : null), [db, isAdmin]);
  const adminChatsQ = useMemo(() => (isAdmin ? query(orgCollection(db, "chats"), orderBy("lastAt", "desc")) : null), [db, isAdmin]);
  const pendingLeaveQ = useMemo(() => (isAdmin ? query(orgCollection(db, "leaveRequests"), where("status", "==", "pending")) : null), [db, isAdmin]);
  const myQuestionsQ = useMemo(() => (isAdmin ? null : query(orgCollection(db, "questions"), where("employeeId", "==", viewer.uid), where("unreadForEmployee", "==", true))), [db, isAdmin, viewer.uid]);
  const remindersQ = useMemo(() => (isAdmin ? null : query(orgCollection(db, "reminders"), where("toUids", "array-contains", viewer.uid), orderBy("createdAt", "desc"), limit(50))), [db, isAdmin, viewer.uid]);
  const everyoneRef = useMemo(() => (isAdmin ? null : orgDocument(db, "chats", EVERYONE_CHAT)), [db, isAdmin]);
  const dmRef = useMemo(() => (isAdmin ? null : orgDocument(db, "chats", dmChatId(viewer.uid))), [db, isAdmin, viewer.uid]);

  const adminQuestions = useCollection<QuestionDoc>(adminQuestionsQ);
  const adminChats = useCollection<ChatDoc>(adminChatsQ);
  const pendingLeave = useCollection<LeaveRequestDoc>(pendingLeaveQ);
  const myQuestions = useCollection<QuestionDoc>(myQuestionsQ);
  const reminders = useCollection<ReminderDoc>(remindersQ);
  const everyone = useDocument<ChatDoc>(everyoneRef);
  const dm = useDocument<ChatDoc>(dmRef);

  return useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (isAdmin) {
      counts["/admin/inbox"] = adminQuestions.data?.length ?? 0;
      counts["/admin/leave"] = pendingLeave.data?.length ?? 0;
      counts["/admin/chat"] = (adminChats.data ?? []).reduce((sum, c) => sum + (c.unread?.[key] ?? 0), 0);
    } else {
      counts["/me/reminders"] = (reminders.data ?? []).filter((r) => !r.readBy[viewer.uid]).length;
      counts["/me/ask"] = myQuestions.data?.length ?? 0;
      counts["/me/chat"] = (everyone.data?.unread?.[key] ?? 0) + (dm.data?.unread?.[key] ?? 0);
    }
    return counts;
  }, [isAdmin, key, viewer.uid, adminQuestions.data, adminChats.data, pendingLeave.data, reminders.data, myQuestions.data, everyone.data, dm.data]);
}
