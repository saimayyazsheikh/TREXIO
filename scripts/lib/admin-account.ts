import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { createWorkspace } from "../../lib/server/workspaces";
import { workspaceDepsFor } from "../../lib/server/workspaces-adapter";

/**
 * Creates (or repairs) a workspace owner with an email and password: the Auth user, a new workspace they administer, and their
 * admin profile. In the real app owners sign up with Google; this is for the emulator demo and for an emergency login.
 * Safe to repeat: an owner who already has a workspace keeps it and only gets their password and name refreshed.
 */
export async function upsertOwner(
  auth: Auth,
  db: Firestore,
  a: { email: string; password: string; name: string; workspaceName: string; code?: string },
): Promise<{ uid: string; orgId: string; code: string; created: boolean }> {
  let uid: string;
  let created = false;
  try {
    uid = (await auth.getUserByEmail(a.email)).uid;
    await auth.updateUser(uid, { password: a.password, displayName: a.name, disabled: false });
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    uid = (await auth.createUser({ email: a.email, password: a.password, displayName: a.name, emailVerified: true })).uid;
    created = true;
  }

  const existing = (await auth.getUser(uid)).customClaims as { orgId?: string } | undefined;
  if (existing?.orgId) {
    const org = await db.doc(`orgs/${existing.orgId}`).get();
    return { uid, orgId: existing.orgId, code: String(org.get("code") ?? ""), created };
  }

  const { orgId, code } = await createWorkspace(
    workspaceDepsFor(auth, db),
    { uid, name: a.name, email: a.email, emailVerified: true, alreadyInWorkspace: false },
    { name: a.workspaceName, code: a.code },
  );
  return { uid, orgId, code, created };
}
