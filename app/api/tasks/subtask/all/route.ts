import { anyRoleRoute } from "@/lib/server/api-auth";
import { subtasksAllSchema } from "@/lib/domain/task-schemas";
import { setAllSubtasks } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Ticks or unticks every checklist step at once. */
export function POST(req: Request) {
  return anyRoleRoute(req, subtasksAllSchema, async (input, session) => {
    await setAllSubtasks(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
