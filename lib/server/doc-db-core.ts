import type { Firestore } from "firebase-admin/firestore";
import type { DocDb } from "@/lib/server/communication";

/** Wires the communication services to a Firestore instance (the real project or the emulator). */
export function createDocDb(db: Firestore): DocDb {
  return {
    now: () => new Date(),
    newId: () => db.collection("_ids").doc().id,
    transaction: (fn) =>
      db.runTransaction((t) =>
        fn({
          get: async (path) => {
            const snap = await t.get(db.doc(path));
            return snap.exists ? (snap.data() as Record<string, unknown>) : null;
          },
          create: (path, data) => void t.create(db.doc(path), data),
          update: (path, patch) => void t.update(db.doc(path), patch),
          find: async (collection, filters, limit) => {
            let q: FirebaseFirestore.Query = db.collection(collection);
            for (const [field, value] of filters) q = q.where(field, "==", value);
            if (limit) q = q.limit(limit);
            const snap = await t.get(q);
            return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
          },
          activeEmployees: async () => {
            const snap = await t.get(db.collection("users").where("role", "==", "employee").where("status", "==", "active"));
            return snap.docs.map((d) => ({ id: d.id, name: String(d.get("name")) }));
          },
        }),
      ),
  };
}
