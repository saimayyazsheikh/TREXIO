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
import { pktDateString } from "../lib/time";
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

  console.log(`\nSeeded: 2 businesses, 3 team members, 4 routines (${generated.created} daily tasks for ${today}), 5 one-off tasks.\n`);
  console.log("Sign in at http://localhost:3000/login with:");
  console.log(`  Admin     ${DEMO.admin.email}`);
  for (const e of DEMO.employees) console.log(`  Employee  ${e.username.padEnd(12)} (${e.name}, ${e.business})`);
  console.log(`  Password  ${DEMO.password}  (same for everyone)\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
