import type { Auth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import type { OrgDb } from "@/lib/server/org-scope";
import type { Deps } from "@/lib/server/employees";
import type { UserDoc } from "@/types/models";

/** Wires the employee service to a Firebase Admin Auth + one workspace's Firestore (the real project or the emulators). */
export function employeeDepsFor(auth: Auth, db: OrgDb, org: { id: string; code: string }): Deps {
  return {
    org,
    auth: {
      createUser: async (p) => ({ uid: (await auth.createUser({ ...p, disabled: false })).uid }),
      updateUser: async (uid, p) => void (await auth.updateUser(uid, p)),
      deleteUser: (uid) => auth.deleteUser(uid),
      setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
      revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
    },
    store: {
      countEmployees: async () => (await db.collection("users").where("role", "==", "employee").count().get()).data().count,
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
