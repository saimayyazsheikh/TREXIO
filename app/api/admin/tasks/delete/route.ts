import { adminRoute } from "@/lib/server/api-auth";
import { deleteTaskSchema } from "@/lib/domain/task-schemas";
import { deleteTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

export function POST(req: Request) {
  return adminRoute(req, deleteTaskSchema, async ({ taskId }, session) => {
    await deleteTask(realTaskDb(session.orgId), session, taskId);
    return { ok: true };
  });
}
