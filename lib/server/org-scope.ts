import type { CollectionReference, DocumentReference, DocumentSnapshot, Firestore, WriteBatch } from "firebase-admin/firestore";

/** Firestore auto-ids are 20 letters and digits. Anything else in a path would be an attempt to step outside a workspace. */
const ORG_ID = /^[A-Za-z0-9]{10,40}$/;

/**
 * A view of the database limited to ONE workspace: every collection and document path is prefixed with `orgs/<id>/`, so
 * the code using it can't read or write another workspace by accident. Server code never builds a raw path itself.
 */
export type OrgDb = {
  orgId: string;
  collection(name: string): CollectionReference;
  doc(path: string): DocumentReference;
  getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]>;
  batch(): WriteBatch;
  runTransaction: Firestore["runTransaction"];
};

export function scopeDb(db: Firestore, orgId: string): OrgDb {
  if (!ORG_ID.test(orgId)) throw new Error("Invalid workspace id.");
  const base = `orgs/${orgId}`;
  return {
    orgId,
    collection: (name) => db.collection(`${base}/${name}`),
    doc: (path) => db.doc(`${base}/${path}`),
    getAll: (...refs) => db.getAll(...refs),
    batch: () => db.batch(),
    runTransaction: db.runTransaction.bind(db),
  };
}

/** Runs `fn` once for every workspace, isolating failures so one broken workspace never stops the others. */
export async function forEachOrg<T>(db: Firestore, fn: (orgId: string) => Promise<T>): Promise<{ orgId: string; ok: boolean; result?: T; error?: string }[]> {
  const orgs = await db.collection("orgs").select().get();
  const out: { orgId: string; ok: boolean; result?: T; error?: string }[] = [];
  for (const o of orgs.docs) {
    try {
      out.push({ orgId: o.id, ok: true, result: await fn(o.id) });
    } catch (error) {
      console.error(`job failed for workspace ${o.id}`, error);
      out.push({ orgId: o.id, ok: false, error: error instanceof Error ? error.message : "failed" });
    }
  }
  return out;
}
