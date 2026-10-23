/**
 * Fills the LOCAL Firebase emulators with a small demo company so you can sign in and click around
 * before a real Firebase project exists.
 *
 *   npm run emulators          (in another terminal)
 *   npm run seed:emulator      add --reset to wipe the emulators and start over
 *
 * Everything goes through the app's real server code (so the audit log and activity feed are real too).
 * It refuses to run unless the Admin SDK is pointed at emulators, so it can never touch production.
 */
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { usingEmulators, initAdminApp } from "../lib/server/admin-config";
import { createTaskSchema, createTemplateSchema } from "../lib/domain/task-schemas";
import { createEmployeeSchema } from "../lib/domain/schemas";
import { createEmployee } from "../lib/server/employees";
import { employeeDepsFor } from "../lib/server/employees-adapter";
import { generateDailyTasks } from "../lib/server/daily-generation";
import { createGenerationDeps, createTaskDb } from "../lib/server/task-db-core";
import { createOneOffTask, transitionTask } from "../lib/server/task-store";
import { createTemplate } from "../lib/server/templates";
import { dateStringFromDayIndex, dayIndexFromDateString, isoWeekdayOfDate, pktDateString } from "../lib/time";
import { upsertAdmin } from "./lib/admin-account";

/** Demo logins for the emulators only. These accounts do not exist anywhere else. */
export const DEMO = {
  admin: { email: "admin@traxio.test", name: "Demo Owner" },
  password: "Traxio-demo-2026!",
  employees: [
    { username: "ali.khan", name: "Ali Khan", designation: "Cashier", business: "Alpha Traders", phone: "+923001234567" },
    { username: "sara.ahmed", name: "Sara Ahmed", designation: "Accountant", business: "Alpha Traders", phone: "+923007654321" },
    { username: "omar.farooq", name: "Omar Farooq", designation: "Supervisor", business: "Beta Foods", phone: "+923331112233" },
  ],
} as const;

const project = process.env.FIREBASE_ADMIN_PROJECT_ID || "demo-traxio";

async function reset() {
  const calls = [
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${project}/databases/(default)/documents`,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${project}/accounts`,
  ];
  for (const url of calls) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error(`Could not reset the emulator (${res.status}). Is it running?`);
  }
  console.log("Emulators cleared.");
}

async function main() {
  if (!usingEmulators()) {
    throw new Error("Refusing to run: this script only seeds the local emulators. Start them with `npm run emulators`, then run `npm run seed:emulator`.");
  }
  if (process.argv.includes("--reset")) await reset();

  const app = initAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  try {
    await auth.getUserByEmail(DEMO.admin.email);
    console.log("Already seeded. Run `npm run seed:emulator -- --reset` to start over.");
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }

  const { uid: adminUid } = await upsertAdmin(auth, db, { ...DEMO.admin, password: DEMO.password });
  const admin = { uid: adminUid, name: DEMO.admin.name, role: "admin" as const };

  const businessIds: Record<string, string> = {};
  const businesses = [
    { name: "Alpha Traders", color: "indigo", workStart: "09:00", workEnd: "18:00", workDays: [1, 2, 3, 4, 5, 6] },
    { name: "Beta Foods", color: "emerald", workStart: "08:00", workEnd: "17:00", workDays: [1, 2, 3, 4, 5] },
  ];
  for (const b of businesses) {
    const ref = db.collection("businesses").doc();
    await ref.set({ ...b, logoUrl: null, active: true, createdAt: new Date() });
    businessIds[b.name] = ref.id;
  }

  const empDeps = employeeDepsFor(auth, db);
  const ids: Record<string, string> = {};
  for (const e of DEMO.employees) {
    const input = createEmployeeSchema.parse({
      name: e.name, username: e.username, password: DEMO.password, businessId: businessIds[e.business], designation: e.designation,
      phone: e.phone, contactEmail: "", workStart: "", workEnd: "",
    });
    ids[e.username] = (await createEmployee(empDeps, input)).uid;
  }

  const taskDb = createTaskDb(db);
  const routine = (employeeId: string, title: string, dueTime: string, steps: string[], activeDays = [1, 2, 3, 4, 5, 6]) =>
    createTemplate(
      taskDb,
      admin,
      createTemplateSchema.parse({ employeeId, title, description: "", priority: "medium", dueTime, subtasks: steps.map((title) => ({ title })), activeDays, active: true }),
    );
  await routine(ids["ali.khan"], "Open shop checks", "09:30", ["Lights and signage", "Counter float counted", "Card machine online"]);
  await routine(ids["ali.khan"], "Cash up", "17:45", ["Count the till", "Record card totals"]);
  await routine(ids["sara.ahmed"], "Reconcile yesterday's sales", "11:00", []);
  await routine(ids["omar.farooq"], "Cold-room temperature log", "10:00", ["Freezer reading", "Chiller reading"], [1, 2, 3, 4, 5]);
  const today = pktDateString();
  const generated = await generateDailyTasks(createGenerationDeps(db), { date: today });

  const oneOff = (over: Record<string, unknown>) => createOneOffTask(taskDb, admin, createTaskSchema.parse({ priority: "medium", date: today, dueTime: "", description: "", ...over }));
  const count = await oneOff({ title: "Count stock on shelves A to D", priority: "high", dueTime: "17:00", assigneeIds: [ids["ali.khan"]], subtasks: ["Shelf A", "Shelf B", "Shelf C", "Shelf D"] });
  const invoices = await oneOff({ title: "Prepare month-end invoices", priority: "high", dueTime: "15:00", assigneeIds: [ids["sara.ahmed"]] });
  await oneOff({ title: "Send invoices to customers", dueTime: "17:00", assigneeIds: [ids["ali.khan"]], dependsOnIds: [invoices.taskId] });
  await oneOff({ title: "Quarterly inventory audit", priority: "high", requiresReview: true, assigneeIds: [ids["ali.khan"], ids["sara.ahmed"]], completionMode: "all", subtasks: ["Count stock", "Match against records"] });
  const alarm = await oneOff({ title: "Fix the cold-room alarm", assigneeIds: [ids["omar.farooq"]], description: "The alarm beeps at random. Check the sensor wiring." });

  const as = (username: string, name: string) => ({ uid: ids[username], name, role: "employee" as const });
  await transitionTask(taskDb, as("ali.khan", "Ali Khan"), { taskId: count.taskId, status: "in_progress" });
  await transitionTask(taskDb, as("omar.farooq", "Omar Farooq"), { taskId: alarm.taskId, status: "blocked", reason: "Waiting for the technician to bring a spare sensor" });

  await seedHistory(db, ids, today);

  console.log(`\nSeeded: 2 businesses, 3 team members, 4 routines (${generated.created} daily tasks for ${today}), 5 one-off tasks.\n`);
  console.log("Sign in at http://localhost:3000/login with:");
  console.log(`  Admin     ${DEMO.admin.email}`);
  for (const e of DEMO.employees) console.log(`  Employee  ${e.username.padEnd(12)} (${e.name}, ${e.business})`);
  console.log(`  Password  ${DEMO.password}  (same for everyone)\n`);
}

/**
 * Two weeks of believable past days so Analytics and the weekly AI summary have something to show. This writes demo data
 * straight into the emulator (past days can't be lived through), so it is for the emulator only and never touches the audit
 * rules: blocked tasks get audit entries like real ones would.
 */
async function seedHistory(db: FirebaseFirestore.Firestore, ids: Record<string, string>, today: string) {
  const reasons = ["Waiting for supplier", "Printer is down", "Waiting for the technician", "waiting for supplier", "Need approval from admin"];
  const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const people = Object.entries(ids);
  const nameOf = new Map(DEMO.employees.map((e) => [ids[e.username], e.name]));
  for (let back = 14; back >= 1; back--) {
    const date = dateStringFromDayIndex(dayIndexFromDateString(today) - back);
    if (isoWeekdayOfDate(date) === 7) continue;
    await generateDailyTasks(createGenerationDeps(db), { date });
    const tasks = await db.collection("tasks").where("date", "==", date).get();
    const batch = db.batch();
    for (const d of tasks.docs) {
      const t = d.data();
      const h = hash(d.id);
      const roll = h % 100;
      const due: Date = t.dueAt?.toDate?.() ?? new Date(`${date}T12:00:00+05:00`);
      const assignees: string[] = t.assigneeIds;
      if (roll < 68) {
        const at = new Date(due.getTime() + ((h % 7) - 3) * 20 * 60_000);
        batch.update(d.ref, { status: "completed", completedAt: at, updatedAt: at, completion: Object.fromEntries(assignees.map((u) => [u, { done: true, at }])) });
      } else if (roll < 80) {
        batch.update(d.ref, { status: "in_progress" });
      } else if (roll < 90) {
        const reason = reasons[h % reasons.length];
        batch.update(d.ref, { status: "blocked", blockedReason: reason });
        batch.set(db.collection("auditLogs").doc(), {
          actorId: assignees[0], actorName: nameOf.get(assignees[0]) ?? "Team member", actorRole: "employee", action: "task.status", entityType: "task", entityId: d.id,
          businessId: t.businessId, from: "in_progress", to: "blocked", meta: { requested: "blocked", reason }, createdAt: new Date(due.getTime() - 60 * 60_000),
        });
      }
    }
    for (const [username, uid] of people) {
      const h = hash(`${username}${date}`);
      const active = 18_000 + (h % 7) * 1_200;
      const idle = 1_200 + (h % 5) * 420;
      const brk = 1_800 + (h % 4) * 600;
      batch.set(db.doc(`presenceDaily/${uid}_${date}`), {
        employeeId: uid, date, activeSec: active, idleSec: idle, breakSec: brk,
        firstSeenAt: new Date(`${date}T09:${String(h % 20).padStart(2, "0")}:00+05:00`), lastSeenAt: new Date(`${date}T17:30:00+05:00`),
      });
      const slots: Record<string, unknown> = {};
      const filled = 4 + (h % 6);
      for (let hour = 9; hour < 9 + filled && hour < 18; hour++) {
        slots[String(hour).padStart(2, "0")] = { text: "Worked through the day's routine tasks", taskIds: [], updatedAt: new Date(`${date}T${String(hour).padStart(2, "0")}:50:00+05:00`) };
      }
      batch.set(db.doc(`journals/${uid}_${date}`), { employeeId: uid, date, dayIndex: dayIndexFromDateString(date), slots, updatedAt: new Date(`${date}T17:00:00+05:00`) });
    }
    await batch.commit();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
