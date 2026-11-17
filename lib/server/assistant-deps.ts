import "server-only";
import { adminDb } from "@/lib/server/admin";
import { scopeDb } from "@/lib/server/org-scope";
import { providerFromEnv } from "@/lib/server/ai";
import type { AssistantDeps } from "@/lib/server/assistant";
import { taskFromFirestore } from "@/lib/server/task-mapper";
import { OPEN_STATUSES, buildWorkload } from "@/lib/domain/workload";
import type { UserDoc } from "@/types/models";

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
      const snap = await db.collection("users").where("role", "==", "employee").where("status", "==", "active").get();
      return snap.docs.map((d) => {
        const u = d.data() as UserDoc;
        return { id: d.id, name: u.name, businessId: u.businessId, designation: u.designation ?? "" };
      });
    },
    loadBusinesses: async () => (await db.collection("businesses").get()).docs.map((d) => ({ id: d.id, name: String(d.get("name")) })),
    loadOpenTasks: async (today, nowMs) => {
      const snap = await db.collection("tasks").where("status", "in", ["todo", "in_progress"]).limit(600).get();
      return snap.docs
        .map((d) => ({ id: d.id, task: taskFromFirestore(d.data()) }))
        .filter(({ task }) => task.dueAt && task.dueAt.getTime() >= nowMs - 24 * 60 * 60_000)
        .sort((a, b) => a.task.dueAt!.getTime() - b.task.dueAt!.getTime())
        .slice(0, 40)
        .map(({ id, task }) => ({
          id,
          title: task.title,
          assigneeNames: task.assigneeIds.map((uid) => task.assigneeNames[uid] ?? "").filter(Boolean),
          date: task.date,
          dueTime: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(task.dueAt!),
        }));
    },
    loadLoads: async (today, nowMs, people) => {
      const [tasks, leave] = await Promise.all([
        db.collection("tasks").where("status", "in", [...OPEN_STATUSES]).limit(1500).get(),
        db.collection("leaveRequests").where("toDate", ">=", today).get(),
      ]);
      const away = new Set(leave.docs.filter((d) => d.get("status") === "approved" && d.get("kind") === "leave" && String(d.get("fromDate")) <= today).map((d) => String(d.get("employeeId"))));
      const rows = buildWorkload({
        people: people.map((p) => ({ id: p.id, name: p.name, businessId: p.businessId })),
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
