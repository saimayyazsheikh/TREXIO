import type { Timestamp } from "firebase/firestore";
import type { Priority, Role, TaskStatus } from "@/lib/domain/constants";
import type { BusinessColorId } from "@/lib/domain/business-colors";

export type BusinessDoc = {
  name: string;
  color: BusinessColorId;
  workStart: string;
  workEnd: string;
  workDays: number[];
  active: boolean;
  createdAt: Timestamp | null;
};

export type UserStatus = "active" | "disabled";

export type UserDoc = {
  role: Role;
  name: string;
  username: string | null;
  /** Firebase Auth email. Employees always use `username@traxio.app` so username login works. */
  email: string;
  /** Real contact email an admin may record for an employee. */
  contactEmail: string | null;
  phone: string | null;
  businessId: string | null;
  designation: string;
  status: UserStatus;
  workStart: string | null;
  workEnd: string | null;
  idleThresholdMin: number | null;
  fcmTokens: string[];
  createdAt: Timestamp | null;
};

/** Task as read in the browser (Firestore Timestamps). Written only by server routes. */
export type TaskDoc = {
  kind: "daily" | "oneoff";
  templateId: string | null;
  date: string;
  businessId: string;
  assigneeIds: string[];
  assigneeNames: Record<string, string>;
  completion: Record<string, { done: boolean }>;
  completionMode: "all" | "any";
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  blockedReason: string | null;
  dueAt: Timestamp | null;
  requiresReview: boolean;
  dependsOnIds: string[];
  relatedTaskIds: string[];
  linkTitles: Record<string, string>;
  waitingOnIds: string[];
  subtasks: { id: string; title: string; done: boolean }[];
  subtaskTotal: number;
  subtaskDone: number;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
  /** Comments on the task, oldest first. */
  notes?: { id: string; by: string; byName: string; text: string; at: Timestamp; about: "comment" | "finish" | "step"; subtaskTitle: string | null }[];
  /** Why a daily routine wasn't done, written by the person it was for. */
  missedReason?: string | null;
  missedReasonAt?: Timestamp | null;
};

export type TemplateDoc = {
  employeeId: string;
  businessId: string;
  title: string;
  description: string;
  priority: Priority;
  dueTime: string | null;
  subtasks: { id: string; title: string }[];
  activeDays: number[];
  active: boolean;
  order: number;
};

export type ReminderDoc = {
  fromUid: string;
  fromName: string;
  toUids: string[];
  toNames: Record<string, string>;
  body: string;
  taskId: string | null;
  taskTitle: string | null;
  readBy: Record<string, Timestamp>;
  createdAt: Timestamp;
};

export type QuestionStatus = "open" | "answered" | "closed";

export type QuestionDoc = {
  employeeId: string;
  employeeName: string;
  businessId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  subject: string;
  status: QuestionStatus;
  urgent: boolean;
  unreadForAdmin: boolean;
  unreadForEmployee: boolean;
  lastMessageAt: Timestamp;
  lastAuthorRole: Role;
  createdAt: Timestamp;
};

export type QuestionMessageDoc = { authorId: string; authorName: string; authorRole: Role; body: string; createdAt: Timestamp };

export type ChatDoc = {
  type: "direct" | "group";
  title: string;
  employeeId: string | null;
  lastMessage: { text: string; authorName: string } | null;
  lastAt: Timestamp | null;
  unread: Record<string, number>;
};

export type ChatMessageDoc = {
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  reactions: Record<string, string[]>;
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deleted: boolean;
};

export type LeaveRequestDoc = {
  employeeId: string;
  employeeName: string;
  businessId: string | null;
  kind: "leave" | "excuse";
  fromDate: string;
  toDate: string;
  fromTime: string | null;
  toTime: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decidedBy: string | null;
  decidedByName: string | null;
  decisionNote: string;
  decidedAt: Timestamp | null;
  createdAt: Timestamp;
};

export type BreakDoc = {
  employeeId: string;
  employeeName: string;
  date: string;
  type: "namaz" | "lunch" | "other";
  note: string;
  startAt: Timestamp;
  endAt: Timestamp | null;
};

export type PresenceDailyDoc = {
  employeeId: string;
  date: string;
  activeSec: number;
  idleSec: number;
  breakSec: number;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
};

export type CalendarDoc = { date: string; name: string; type: "holiday" | "closure"; businessId: string | null };

export type JournalDoc = {
  employeeId: string;
  date: string;
  dayIndex: number;
  slots: Record<string, { text: string; taskIds: string[]; updatedAt: Timestamp | null } | undefined>;
  updatedAt: Timestamp | null;
};

export type WithId<T> = T & { id: string };
