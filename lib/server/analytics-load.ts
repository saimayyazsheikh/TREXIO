import type { OrgDb } from "@/lib/server/org-scope";
import type { AnalyticsInput } from "@/lib/domain/analytics";
import { pktDayBounds } from "@/lib/time";
import { taskFromFirestore } from "@/lib/server/task-mapper";
import type { UserDoc } from "@/types/models";

const CAP = 5000;

/** Everything the analytics maths needs for [from, to], across all businesses (the page and the weekly summary share it). */
export async function loadAnalyticsInput(db: OrgDb, from: string, to: string, nowMs = Date.now()): Promise<AnalyticsInput> {
  const start = pktDayBounds(from).start;
  const end = pktDayBounds(to).end;
  const inDates = (name: string) => db.collection(name).where("date", ">=", from).where("date", "<=", to).limit(CAP);
  const [tasks, presence, journals, audit, calendar, users, businesses] = await Promise.all([
    inDates("tasks").get(),
    inDates("presenceDaily").get(),
    inDates("journals").get(),
    db.collection("auditLogs").where("createdAt", ">=", start).where("createdAt", "<", end).limit(CAP).get(),
    inDates("calendar").get(),
    db.collection("users").where("role", "==", "employee").where("status", "==", "active").get(),
    db.collection("businesses").get(),
  ]);

  return {
    from,
    to,
    businessId: "",
    nowMs,
    people: users.docs.map((d) => {
      const u = d.data() as UserDoc;
      return { id: d.id, name: u.name, businessId: u.businessId, workStart: u.workStart ?? null, workEnd: u.workEnd ?? null };
    }),
    businesses: businesses.docs.map((d) => ({ id: d.id, name: String(d.get("name")), workDays: d.get("workDays") as number[], workStart: String(d.get("workStart")), workEnd: String(d.get("workEnd")) })),
    tasks: tasks.docs.map((d) => {
      const t = taskFromFirestore(d.data());
      return {
        date: t.date,
        businessId: t.businessId,
        assigneeIds: t.assigneeIds,
        doneBy: Object.entries(t.completion).filter(([, c]) => c.done).map(([uid]) => uid),
        status: t.status,
        dueAtMs: t.dueAt?.getTime() ?? null,
        completedAtMs: t.completedAt?.getTime() ?? null,
      };
    }),
    presence: presence.docs.map((d) => ({ employeeId: String(d.get("employeeId")), date: String(d.get("date")), activeSec: Number(d.get("activeSec")) || 0, idleSec: Number(d.get("idleSec")) || 0, breakSec: Number(d.get("breakSec")) || 0 })),
    journals: journals.docs.map((d) => ({
      employeeId: String(d.get("employeeId")),
      date: String(d.get("date")),
      slots: Object.fromEntries(
        Object.entries((d.get("slots") ?? {}) as Record<string, { text?: string; taskIds?: string[] } | undefined>).flatMap(([k, v]) => (v ? [[k, { text: v.text ?? "", taskIds: v.taskIds ?? [] }]] : [])),
      ),
    })),
    blocked: audit.docs.flatMap((d) => {
      const meta = (d.get("meta") ?? {}) as Record<string, unknown>;
      return d.get("action") === "task.status" && d.get("to") === "blocked" && typeof meta.reason === "string" ? [{ reason: meta.reason, businessId: String(d.get("businessId") ?? "") }] : [];
    }),
    closed: calendar.docs.map((d) => ({ date: String(d.get("date")), businessId: (d.get("businessId") as string | null) ?? null })),
  };
}
