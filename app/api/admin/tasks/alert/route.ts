import { adminRoute } from "@/lib/server/api-auth";
import { taskAlertSchema } from "@/lib/domain/task-schemas";
import { setTaskAlert } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** "Tell me when this task is N minutes late" (or remove it). */
export function POST(req: Request) {
  return adminRoute(req, taskAlertSchema, async (input, session) => {
    await setTaskAlert(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
