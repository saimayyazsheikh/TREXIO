import type { OrgDb } from "@/lib/server/org-scope";
import { resolveSettings, SETTINGS_PATH } from "@/lib/domain/automation";
import { queueNotification } from "@/lib/server/notify";
import type { AutomationDeps } from "@/lib/server/automation";
import { createDocDb } from "@/lib/server/doc-db-core";
import type { Notice } from "@/lib/server/communication";
import { taskFromFirestore } from "@/lib/server/task-mapper";
import type { UserDoc } from "@/types/models";

const ALREADY_EXISTS = 6;

/** The automation jobs wired to a Firestore instance (the real project or the emulator). */
export function createAutomationDeps(db: OrgDb, push: (orgId: string, n: Notice) => Promise<void>): AutomationDeps {
  const docDb = createDocDb(db, push);
  const person = (u: Partial<UserDoc>) => ({ name: String(u.name ?? ""), status: (u.status ?? "disabled") as "active" | "disabled", businessId: u.businessId ?? null });
  return {
    now: () => new Date(),
    loadSettings: async () => resolveSettings((await db.doc(SETTINGS_PATH).get()).data()),
    loadDueBetween: async (fromMs, toMs) => {
      const snap = await db.collection("tasks").where("dueAt", ">=", new Date(fromMs)).where("dueAt", "<=", new Date(toMs)).get();
      return snap.docs.map((d) => ({ id: d.id, task: taskFromFirestore(d.data()) }));
    },
    loadTasksOnDate: async (date) => {
      const snap = await db.collection("tasks").where("date", "==", date).get();
      return snap.docs.map((d) => ({ id: d.id, task: taskFromFirestore(d.data()) }));
    },
    loadCalendar: async (date) => {
      const snap = await db.collection("calendar").where("date", "==", date).get();
      return snap.docs.map((d) => ({ date: String(d.get("date")), businessId: (d.get("businessId") as string | null) ?? null }));
    },
    loadEmployeesOnLeave: async (date) => {
      const snap = await db.collection("leaveRequests").where("status", "==", "approved").where("fromDate", "<=", date).get();
      return new Set(snap.docs.filter((d) => d.get("kind") === "leave" && String(d.get("toDate")) >= date).map((d) => String(d.get("employeeId"))));
    },
    loadPeople: async (ids) => {
      if (ids.length === 0) return new Map();
      const docs = await db.getAll(...ids.map((id) => db.doc(`users/${id}`)));
      return new Map(docs.filter((d) => d.exists).map((d) => [d.id, person(d.data() as UserDoc)]));
    },
    loadActiveEmployees: async () => {
      const snap = await db.collection("users").where("role", "==", "employee").where("status", "==", "active").get();
      return snap.docs.map((d) => ({ id: d.id, person: person(d.data() as UserDoc) }));
    },
    loadBusinesses: async (ids) => {
      if (ids.length === 0) return new Map();
      const docs = await db.getAll(...ids.map((id) => db.doc(`businesses/${id}`)));
      return new Map(docs.filter((d) => d.exists).map((d) => [d.id, { name: String(d.get("name")), active: d.get("active") as boolean, workDays: d.get("workDays") as number[] }]));
    },
    claimEscalation: (taskId, level, at) =>
      db.runTransaction(async (t) => {
        const ref = db.doc(`tasks/${taskId}`);
        const snap = await t.get(ref);
        const key = level === 1 ? "l1At" : "l2At";
        if (!snap.exists || (snap.get(`escalation.${key}`) ?? null) !== null) return false;
        t.update(ref, { [`escalation.${key}`]: at });
        return true;
      }),
    claimRun: async (key) => {
      try {
        await db.doc(`automationRuns/${key}`).create({ at: new Date() });
        return true;
      } catch (error) {
        if ((error as { code?: number }).code === ALREADY_EXISTS) return false;
        throw error;
      }
    },
    notify: (n) => docDb.transaction(async (tx) => queueNotification(docDb, tx, n)),
  };
}
