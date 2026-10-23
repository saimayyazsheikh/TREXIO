import { anyRoleRoute } from "@/lib/server/api-auth";
import { transitionSchema } from "@/lib/domain/task-schemas";
import { transitionTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Every status change in the app goes through here (and through the shared writer). */
export function POST(req: Request) {
  return anyRoleRoute(req, transitionSchema, async (input, session) => {
    await transitionTask(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
