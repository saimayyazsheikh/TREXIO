import "server-only";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { SETTINGS_PATH } from "@/lib/domain/automation";
import type { Actor } from "@/lib/domain/tasks";
import { adminDb } from "@/lib/server/admin";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { realDocDb } from "@/lib/server/doc-db";
import { realEmployeeDeps } from "@/lib/server/employees-deps";
import { scopeDb } from "@/lib/server/org-scope";
import type { RunDeps } from "@/lib/server/assistant-run";
import { realGenerationDeps, realTaskDb } from "@/lib/server/task-db";
import { pktDateString } from "@/lib/time";
import type { UserDoc } from "@/types/models";

/** Wires the confirmed actions to this workspace's real data. */
export async function realRunDeps(orgId: string, actor: Actor): Promise<RunDeps> {
  const db = scopeDb(adminDb(), orgId);
  return {
    actor,
    taskDb: realTaskDb(orgId),
    docDb: realDocDb(orgId),
    employees: await realEmployeeDeps(orgId),
    newId: () => randomBytes(12).toString("hex"),
    getEmployee: async (uid) => {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists || snap.get("role") !== "employee") return null;
      const u = snap.data() as UserDoc;
      return { name: u.name, contactEmail: u.contactEmail ?? null, phone: u.phone ?? null, businessId: u.businessId ?? null, designation: u.designation ?? "", workStart: u.workStart ?? null, workEnd: u.workEnd ?? null };
    },
    afterRoutineChange: async (employeeId) => {
      await generateDailyTasks(realGenerationDeps(orgId), { date: pktDateString(), employeeId });
    },
    getSettings: async () => (await db.doc(SETTINGS_PATH).get()).data(),
    saveSettings: async (settings) => void (await db.doc(SETTINGS_PATH).set(settings)),
    setCalendar: async (id, data) => void (await db.doc(`calendar/${id}`).set(data)),
    deleteCalendar: async (id) => {
      const ref = db.doc(`calendar/${id}`);
      if (!(await ref.get()).exists) return false;
      await ref.delete();
      return true;
    },
    createBusiness: async (data) => (await db.collection("businesses").add({ ...data, createdAt: FieldValue.serverTimestamp() })).id,
    getBusiness: async (id) => {
      const snap = await db.doc(`businesses/${id}`).get();
      if (!snap.exists) return null;
      return { name: String(snap.get("name")), color: String(snap.get("color")), workStart: String(snap.get("workStart")), workEnd: String(snap.get("workEnd")), workDays: snap.get("workDays") as number[], active: snap.get("active") !== false };
    },
    updateBusiness: async (id, data) => void (await db.doc(`businesses/${id}`).update(data)),
  };
}
