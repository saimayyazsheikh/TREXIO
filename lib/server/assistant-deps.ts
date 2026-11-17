import "server-only";
import { adminDb } from "@/lib/server/admin";
import { scopeDb } from "@/lib/server/org-scope";
import { providerFromEnv } from "@/lib/server/ai";
import type { AssistantDeps } from "@/lib/server/assistant";
import { taskFromFirestore } from "@/lib/server/task-mapper";
import { OPEN_STATUSES, buildWorkload } from "@/lib/domain/workload";
import { MAX_LEAVES_IN_PROMPT, MAX_OPEN_TASKS_IN_PROMPT, MAX_ROUTINES_IN_PROMPT } from "@/lib/domain/assistant";
import type { UserDoc } from "@/types/models";

const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Wires the assistant to this workspace's people and tasks, and to whichever AI the server is set up for. */
export function realAssistantDeps(orgId: string): AssistantDeps {
  const db = scopeDb(adminDb(), orgId);
  return {
    now: () => new Date(),
    provider: providerFromEnv({
      AI_PROVIDER: process.env.AI_PROVIDER,
      AI_MODEL: process.env.AI_MODEL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
    }),
    loadPeople: async () => {
      const snap = await db.collection("users").where("role", "==", "employee").get();
      return snap.docs
        .map((d) => {
          const u = d.data() as UserDoc;
          return { id: d.id, name: u.name, businessId: u.businessId, designation: u.designation ?? "", status: (u.status === "disabled" ? "disabled" : "active") as "active" | "disabled" };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    loadBusinesses: async () => (await db.collection("businesses").get()).docs.map((d) => ({ id: d.id, name: String(d.get("name")) })),
    loadLists: async (today) => {
      const [tasks, templates, leave, users] = await Promise.all([
        db.collection("tasks").where("status", "in", [...OPEN_STATUSES]).limit(1500).get(),
        db.collection("taskTemplates").limit(200).get(),
        db.collection("leaveRequests").where("status", "==", "pending").limit(MAX_LEAVES_IN_PROMPT).get(),
        db.collection("users").where("role", "==", "employee").get(),
      ]);
      const names = new Map(users.docs.map((d) => [d.id, String(d.get("name"))]));
      return {
        // One-off tasks from the last two weeks onward, plus today's routine tasks: what an admin is likely to mean.
        tasks: tasks.docs
          .map((d) => ({ id: d.id, task: taskFromFirestore(d.data()) }))
          .filter(({ task }) => (task.kind === "daily" ? task.date === today : task.date >= new Date(Date.parse(`${today}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10)))
          .sort((a, b) => a.task.date.localeCompare(b.task.date) || (a.task.dueAt?.getTime() ?? 0) - (b.task.dueAt?.getTime() ?? 0))
          .slice(0, MAX_OPEN_TASKS_IN_PROMPT)
          .map(({ id, task }) => ({
            id,
            title: task.title,
            kind: task.kind,
            assigneeNames: task.assigneeIds.map((uid) => task.assigneeNames[uid] ?? "").filter(Boolean),
            date: task.date,
            dueTime: task.dueAt ? clock(task.dueAt) : "",
            priority: task.priority,
            status: task.status,
          })),
        routines: templates.docs.slice(0, MAX_ROUTINES_IN_PROMPT).map((d) => ({
          id: d.id,
          title: String(d.get("title")),
          employeeName: names.get(String(d.get("employeeId"))) ?? "someone",
          dueTime: (d.get("dueTime") as string | null) ?? "",
          activeDays: (d.get("activeDays") as number[]) ?? [],
          active: d.get("active") !== false,
        })),
        leaves: leave.docs.map((d) => ({
          id: d.id,
          employeeName: String(d.get("employeeName")),
          kind: d.get("kind") === "excuse" ? ("excuse" as const) : ("leave" as const),
          fromDate: String(d.get("fromDate")),
          toDate: String(d.get("toDate")),
          reason: String(d.get("reason")).slice(0, 120),
        })),
      };
    },
    loadLoads: async (today, nowMs, people) => {
      const [tasks, leave] = await Promise.all([
        db.collection("tasks").where("status", "in", [...OPEN_STATUSES]).limit(1500).get(),
        db.collection("leaveRequests").where("toDate", ">=", today).get(),
      ]);
      const away = new Set(leave.docs.filter((d) => d.get("status") === "approved" && d.get("kind") === "leave" && String(d.get("fromDate")) <= today).map((d) => String(d.get("employeeId"))));
      const rows = buildWorkload({
        people: people.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name, businessId: p.businessId })),
        tasks: tasks.docs.map((d) => {
          const t = taskFromFirestore(d.data());
          return {
            kind: t.kind,
            date: t.date,
            status: t.status,
            priority: t.priority,
            dueAtMs: t.dueAt?.getTime() ?? null,
            assigneeIds: t.assigneeIds,
            doneBy: Object.entries(t.completion).filter(([, c]) => c.done).map(([uid]) => uid),
          };
        }),
        today,
        nowMs,
        away,
      });
      return rows.map((r) => ({ personId: r.id, open: r.open, overdue: r.overdue, today: r.today, away: r.load === "away" }));
    },
  };
}
