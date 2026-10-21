import type { Timestamp } from "firebase/firestore";
import type { Priority, Role, TaskStatus } from "@/lib/domain/constants";
import type { BusinessColorId } from "@/lib/domain/business-colors";

export type BusinessDoc = {
  name: string;
  color: BusinessColorId;
  logoUrl: string | null;
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
  photoUrl: string | null;
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
  attachments: { name: string; url: string; size: number; type: string }[];
  createdAt: Timestamp;
  completedAt: Timestamp | null;
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

export type AttachmentDoc = { name: string; url: string; size: number; type: string };

export type ReminderDoc = {
  fromUid: string;
  fromName: string;
  toUids: string[];
  toNames: Record<string, string>;
  body: string;
  attachments: AttachmentDoc[];
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

export type QuestionMessageDoc = { authorId: string; authorName: string; authorRole: Role; body: string; attachments: AttachmentDoc[]; createdAt: Timestamp };

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
  attachments: AttachmentDoc[];
  reactions: Record<string, string[]>;
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deleted: boolean;
};

export type WithId<T> = T & { id: string };
