import { employeeRoute } from "@/lib/server/api-auth";
import { createSelfTaskSchema, deleteTaskSchema, updateSelfTaskSchema } from "@/lib/domain/task-schemas";
import { createSelfTask, deleteSelfTask, updateSelfTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** An employee adds a task for themselves. */
export function POST(req: Request) {
  return employeeRoute(req, createSelfTaskSchema, (input, session) => createSelfTask(realTaskDb(session.orgId), session, input));
}

export function PATCH(req: Request) {
  return employeeRoute(req, updateSelfTaskSchema, async (input, session) => {
    await updateSelfTask(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}

export function DELETE(req: Request) {
  return employeeRoute(req, deleteTaskSchema, async (input, session) => {
    await deleteSelfTask(realTaskDb(session.orgId), session, input.taskId);
    return { ok: true };
  });
}
