import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/server/admin";
import type { Deps } from "@/lib/server/employees";
import type { UserDoc } from "@/types/models";

/** Wires the employee service to the real Firebase Admin SDK. */
export function realEmployeeDeps(): Deps {
  const auth = adminAuth();
  const db = adminDb();
  return {
    auth: {
      createUser: async (p) => ({ uid: (await auth.createUser({ ...p, disabled: false })).uid }),
      updateUser: async (uid, p) => void (await auth.updateUser(uid, p)),
      deleteUser: (uid) => auth.deleteUser(uid),
      setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
      revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
    },
    store: {
      businessExists: async (id) => (await db.doc(`businesses/${id}`).get()).exists,
      getUser: async (uid) => {
        const snap = await db.doc(`users/${uid}`).get();
        if (!snap.exists) return null;
        const d = snap.data() as UserDoc;
        return { role: d.role, businessId: d.businessId, status: d.status };
      },
      createUser: (uid, data) => db.doc(`users/${uid}`).set({ ...data, createdAt: FieldValue.serverTimestamp() }).then(() => undefined),
      updateUser: (uid, data) => db.doc(`users/${uid}`).update(data).then(() => undefined),
    },
  };
}
