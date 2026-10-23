import { adminRoute } from "@/lib/server/api-auth";
import { createTaskSchema, updateTaskSchema } from "@/lib/domain/task-schemas";
import { createOneOffTask, updateOneOffTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Assigns a one-off task. */
export function POST(req: Request) {
  return adminRoute(req, createTaskSchema, (input, session) => createOneOffTask(realTaskDb(session.orgId), session, input));
}

export function PATCH(req: Request) {
  return adminRoute(req, updateTaskSchema, async (input, session) => {
    await updateOneOffTask(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
