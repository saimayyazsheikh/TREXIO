import { anyRoleRoute } from "@/lib/server/api-auth";
import { commentSchema } from "@/lib/domain/task-schemas";
import { commentOnTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Leave a comment on a task: from the person it is for, or the admin. */
export function POST(req: Request) {
  return anyRoleRoute(req, commentSchema, async (input, session) => {
    await commentOnTask(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
