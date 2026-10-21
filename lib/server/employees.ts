import { USERNAME_EMAIL_DOMAIN } from "@/lib/auth-identifier";
import type { CreateEmployeeInput, UpdateEmployeeInput } from "@/lib/domain/schemas";
import { ServiceError } from "@/lib/server/service-error";
import type { UserDoc, UserStatus } from "@/types/models";

/** The slice of firebase-admin Auth this service needs (kept small so it can be faked in tests). */
export type AuthPort = {
  createUser(p: { email: string; password: string; displayName: string }): Promise<{ uid: string }>;
  updateUser(uid: string, p: { displayName?: string; password?: string; disabled?: boolean }): Promise<void>;
  deleteUser(uid: string): Promise<void>;
  setCustomUserClaims(uid: string, claims: { role: "employee"; businessId: string }): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
};

export type StorePort = {
  businessExists(id: string): Promise<boolean>;
  getUser(uid: string): Promise<Pick<UserDoc, "role" | "businessId" | "status"> | null>;
  /** Creates the user document (the adapter stamps `createdAt`). */
  createUser(uid: string, data: Omit<UserDoc, "createdAt">): Promise<void>;
  updateUser(uid: string, data: Partial<UserDoc>): Promise<void>;
};

export type Deps = { auth: AuthPort; store: StorePort };

const isCode = (error: unknown, code: string) => typeof error === "object" && error !== null && (error as { code?: string }).code === code;

async function requireEmployee(deps: Deps, uid: string) {
  const user = await deps.store.getUser(uid);
  if (!user || user.role !== "employee") throw new ServiceError("That team member doesn't exist.", 404);
  return user;
}

export async function createEmployee(deps: Deps, input: CreateEmployeeInput): Promise<{ uid: string }> {
  if (!(await deps.store.businessExists(input.businessId))) throw new ServiceError("That business doesn't exist.", 400);

  const email = `${input.username}@${USERNAME_EMAIL_DOMAIN}`;
  let uid: string;
  try {
    ({ uid } = await deps.auth.createUser({ email, password: input.password, displayName: input.name }));
  } catch (error) {
    if (isCode(error, "auth/email-already-exists")) throw new ServiceError("That username is already taken.", 409);
    throw error;
  }

  try {
    await deps.auth.setCustomUserClaims(uid, { role: "employee", businessId: input.businessId });
    await deps.store.createUser(uid, {
      role: "employee",
      name: input.name,
      username: input.username,
      email,
      contactEmail: input.contactEmail,
      phone: input.phone,
      photoUrl: null,
      businessId: input.businessId,
      designation: input.designation,
      status: "active",
      workStart: input.workStart,
      workEnd: input.workEnd,
      idleThresholdMin: null,
      fcmTokens: [],
    });
  } catch (error) {
    // Never leave a login without a profile behind.
    await deps.auth.deleteUser(uid).catch(() => undefined);
    throw error;
  }
  return { uid };
}

export async function updateEmployee(deps: Deps, uid: string, input: UpdateEmployeeInput): Promise<void> {
  const current = await requireEmployee(deps, uid);
  if (!(await deps.store.businessExists(input.businessId))) throw new ServiceError("That business doesn't exist.", 400);

  const businessChanged = current.businessId !== input.businessId;
  await deps.auth.updateUser(uid, { displayName: input.name });
  if (businessChanged) {
    await deps.auth.setCustomUserClaims(uid, { role: "employee", businessId: input.businessId });
    // Force a fresh token so the new businessId claim applies everywhere.
    await deps.auth.revokeRefreshTokens(uid);
  }
  await deps.store.updateUser(uid, {
    name: input.name,
    contactEmail: input.contactEmail,
    phone: input.phone,
    businessId: input.businessId,
    designation: input.designation,
    workStart: input.workStart,
    workEnd: input.workEnd,
  });
}

export async function setEmployeeStatus(deps: Deps, uid: string, status: UserStatus): Promise<void> {
  await requireEmployee(deps, uid);
  await deps.auth.updateUser(uid, { disabled: status === "disabled" });
  // Disabling must end live sessions too; enabling is harmless.
  await deps.auth.revokeRefreshTokens(uid);
  await deps.store.updateUser(uid, { status });
}

export async function resetEmployeePassword(deps: Deps, uid: string, password: string): Promise<void> {
  await requireEmployee(deps, uid);
  await deps.auth.updateUser(uid, { password });
  await deps.auth.revokeRefreshTokens(uid);
}
