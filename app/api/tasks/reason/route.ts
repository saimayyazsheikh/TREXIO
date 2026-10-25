import { anyRoleRoute } from "@/lib/server/api-auth";
import { missedReasonSchema } from "@/lib/domain/task-schemas";
import { explainMissedRoutine } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Say why a daily routine wasn't done. Only the person it was for may. */
export function POST(req: Request) {
  return anyRoleRoute(req, missedReasonSchema, async (input, session) => {
    await explainMissedRoutine(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
