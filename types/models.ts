import type { Timestamp } from "firebase/firestore";
import type { Role } from "@/lib/domain/constants";
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

export type WithId<T> = T & { id: string };
