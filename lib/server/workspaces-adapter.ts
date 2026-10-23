import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { WorkspaceDeps } from "@/lib/server/workspaces";

const TAKEN = Symbol("code taken");
const HAS_WORKSPACE = Symbol("owner has a workspace");

/** Wires workspace creation to Firebase Admin (the real project or the emulators). */
export function workspaceDepsFor(auth: Auth, db: Firestore): WorkspaceDeps {
  return {
    auth: { setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims) },
    store: {
      newOrgId: () => db.collection("orgs").doc().id,
      createWorkspace: async (w) => {
        try {
          await db.runTransaction(async (t) => {
            const codeRef = db.doc(`orgCodes/${w.code}`);
            const ownerRef = db.doc(`orgOwners/${w.owner.uid}`);
            const [code, existing] = await Promise.all([t.get(codeRef), t.get(ownerRef)]);
            if (existing.exists) throw HAS_WORKSPACE;
            if (code.exists) throw TAKEN;
            t.create(ownerRef, { orgId: w.orgId, createdAt: FieldValue.serverTimestamp() });
            t.create(codeRef, { orgId: w.orgId, createdAt: FieldValue.serverTimestamp() });
            t.create(db.doc(`orgs/${w.orgId}`), { name: w.name, code: w.code, ownerUid: w.owner.uid, plan: "free", createdAt: FieldValue.serverTimestamp() });
            t.create(db.doc(`orgs/${w.orgId}/users/${w.owner.uid}`), {
              role: "admin",
              name: w.owner.name,
              username: null,
              email: w.owner.email,
              contactEmail: w.owner.email,
              phone: null,
              businessId: null,
              designation: "Owner",
              status: "active",
              workStart: null,
              workEnd: null,
              idleThresholdMin: null,
              fcmTokens: [],
              createdAt: FieldValue.serverTimestamp(),
            });
          });
          return "ok";
        } catch (error) {
          if (error === TAKEN) return "code-taken";
          if (error === HAS_WORKSPACE) return "owner-has-workspace";
          throw error;
        }
      },
    },
  };
}
