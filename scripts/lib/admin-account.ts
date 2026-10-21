import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/** Creates (or repairs) the single admin: Auth user, `role: admin` claim and profile document. Safe to repeat. */
export async function upsertAdmin(auth: Auth, db: Firestore, a: { email: string; password: string; name: string }): Promise<{ uid: string; created: boolean }> {
  let uid: string;
  let created = false;
  try {
    uid = (await auth.getUserByEmail(a.email)).uid;
    await auth.updateUser(uid, { password: a.password, displayName: a.name, disabled: false });
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    uid = (await auth.createUser({ email: a.email, password: a.password, displayName: a.name })).uid;
    created = true;
  }

  await auth.setCustomUserClaims(uid, { role: "admin" });
  await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).set(
    {
      role: "admin",
      name: a.name,
      username: null,
      email: a.email,
      contactEmail: a.email,
      phone: null,
      photoUrl: null,
      businessId: null,
      designation: "Owner",
      status: "active",
      workStart: null,
      workEnd: null,
      idleThresholdMin: null,
      fcmTokens: [],
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { uid, created };
}
