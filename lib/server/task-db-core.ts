import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { GenerationDeps } from "@/lib/server/daily-generation";
import { taskFromFirestore, templateFromFirestore } from "@/lib/server/task-mapper";
import type { AssigneeRecord, TaskDb } from "@/lib/server/task-store";
import type { TemplateData } from "@/lib/domain/task-builders";
import type { TaskData } from "@/lib/domain/tasks";
import type { UserDoc } from "@/types/models";

const ALREADY_EXISTS = 6;
const BATCH_SIZE = 400;

/** Wires the shared task writer to a Firestore instance (the real project or the emulator): all writes in one transaction. */
export function createTaskDb(db: Firestore): TaskDb {
  return {
    now: () => new Date(),
    newId: () => db.collection("tasks").doc().id,
    transaction: (fn) =>
      db.runTransaction((t) =>
        fn({
          getTask: async (id) => {
            const snap = await t.get(db.doc(`tasks/${id}`));
            return snap.exists ? taskFromFirestore(snap.data()!) : null;
          },
          getTasksLinkingTo: async (taskId) => {
            const [dependents, related] = await Promise.all([
              t.get(db.collection("tasks").where("dependsOnIds", "array-contains", taskId)),
              t.get(db.collection("tasks").where("relatedTaskIds", "array-contains", taskId)),
            ]);
            const byId = new Map<string, TaskData>();
            for (const d of [...dependents.docs, ...related.docs]) byId.set(d.id, taskFromFirestore(d.data()));
            return [...byId].map(([id, task]) => ({ id, task }));
          },
          getUser: async (uid): Promise<AssigneeRecord | null> => {
            const snap = await t.get(db.doc(`users/${uid}`));
            if (!snap.exists) return null;
            const u = snap.data() as UserDoc;
            return { name: u.name, businessId: u.businessId, role: u.role, status: u.status };
          },
          setTask: (id, data) => void t.set(db.doc(`tasks/${id}`), data),
          updateTask: (id, patch) => void t.update(db.doc(`tasks/${id}`), patch),
          deleteTask: (id) => void t.delete(db.doc(`tasks/${id}`)),
          getTemplate: async (id) => {
            const snap = await t.get(db.doc(`taskTemplates/${id}`));
            return snap.exists ? templateFromFirestore(snap.data()!) : null;
          },
          setTemplate: (id, data) => void t.set(db.doc(`taskTemplates/${id}`), data),
          updateTemplate: (id, patch) => void t.update(db.doc(`taskTemplates/${id}`), patch),
          deleteTemplate: (id) => void t.delete(db.doc(`taskTemplates/${id}`)),
          addAudit: (entry) => void t.set(db.collection("auditLogs").doc(), entry),
          addActivity: (entry) => void t.set(db.collection("activity").doc(), entry),
        }),
      ),
  };
}

async function getAllByIds(db: Firestore, collection: string, ids: string[]) {
  if (ids.length === 0) return [];
  const refs: DocumentReference[] = ids.map((id) => db.doc(`${collection}/${id}`));
  return db.getAll(...refs);
}

export function createGenerationDeps(db: Firestore): GenerationDeps {
  return {
    now: () => new Date(),
    loadTemplates: async (employeeId) => {
      let q = db.collection("taskTemplates").where("active", "==", true);
      if (employeeId) q = q.where("employeeId", "==", employeeId);
      const snap = await q.get();
      return snap.docs.map((d) => ({ id: d.id, data: templateFromFirestore(d.data()) as TemplateData }));
    },
    loadEmployees: async (ids) => {
      const docs = await getAllByIds(db, "users", ids);
      return new Map(docs.filter((d) => d.exists).map((d) => [d.id, { name: (d.data() as UserDoc).name, status: (d.data() as UserDoc).status, businessId: (d.data() as UserDoc).businessId }]));
    },
    loadBusinesses: async (ids) => {
      const docs = await getAllByIds(db, "businesses", ids);
      return new Map(docs.filter((d) => d.exists).map((d) => [d.id, { active: d.get("active") as boolean, workDays: d.get("workDays") as number[] }]));
    },
    loadCalendar: async (date) => {
      const snap = await db.collection("calendar").where("date", "==", date).get();
      return snap.docs.map((d) => ({ date: String(d.get("date")), businessId: (d.get("businessId") as string | null) ?? null }));
    },
    loadEmployeesOnLeave: async (date) => {
      // Approved leave that has started by `date`; the end date is checked here (one inequality per query).
      const snap = await db.collection("leaveRequests").where("status", "==", "approved").where("fromDate", "<=", date).get();
      return new Set(snap.docs.filter((d) => d.get("kind") === "leave" && String(d.get("toDate")) >= date).map((d) => String(d.get("employeeId"))));
    },
    existingTaskIds: async (ids) => new Set((await getAllByIds(db, "tasks", ids)).filter((d) => d.exists).map((d) => d.id)),
    createTasks: async (items: { id: string; data: TaskData }[]) => {
      let created = 0;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const { id, data } of chunk) batch.create(db.doc(`tasks/${id}`), data);
        try {
          await batch.commit();
          created += chunk.length;
        } catch (error) {
          if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
          // Another run created some of them first: fall back to one-by-one so we keep the rest.
          for (const { id, data } of chunk) {
            try {
              await db.doc(`tasks/${id}`).create(data);
              created++;
            } catch (inner) {
              if ((inner as { code?: number }).code !== ALREADY_EXISTS) throw inner;
            }
          }
        }
      }
      return created;
    },
    writeAudit: async (entry) => void (await db.collection("auditLogs").add(entry)),
  };
}
