import "server-only";
import { adminAuth, adminDb } from "@/lib/server/admin";
import type { Deps } from "@/lib/server/employees";
import { employeeDepsFor } from "@/lib/server/employees-adapter";
import { scopeDb } from "@/lib/server/org-scope";
import { ServiceError } from "@/lib/server/service-error";

/** Wires the employee service to the real Firebase Admin SDK, inside one workspace. */
export async function realEmployeeDeps(orgId: string): Promise<Deps> {
  const db = scopeDb(adminDb(), orgId);
  const org = await adminDb().doc(`orgs/${orgId}`).get();
  if (!org.exists) throw new ServiceError("This workspace no longer exists.", 404);
  return employeeDepsFor(adminAuth(), db, { id: orgId, code: String(org.get("code")) });
}
