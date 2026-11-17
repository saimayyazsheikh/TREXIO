import { anyRoleRoute } from "@/lib/server/api-auth";
import { alertBlocked } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";
import { transitionSchema } from "@/lib/domain/task-schemas";
import { transitionTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Every status change in the app goes through here (and through the shared writer). */
export function POST(req: Request) {
  return anyRoleRoute(req, transitionSchema, async (input, session) => {
    const db = realTaskDb(session.orgId);
    await transitionTask(db, session, input);
    // An employee blocking a task tells the admin straight away (unless switched off in Automation).
    if (input.status === "blocked" && session.role === "employee") {
      const task = await db.transaction((tx) => tx.getTask(input.taskId)).catch(() => null);
      if (task) await alertBlocked(realAutomationDeps(session.orgId), { employeeName: session.name, title: task.title, reason: (input.reason ?? "").trim() || "no reason given" });
    }
    return { ok: true };
  });
}
