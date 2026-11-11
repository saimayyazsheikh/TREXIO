import { z } from "zod";
import { adminRoute } from "@/lib/server/api-auth";
import { createTaskSchema, updateTaskSchema } from "@/lib/domain/task-schemas";
import { createOneOffTask, updateOneOffTask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Assigns a one-off task. With `dumpId`, the task is being scheduled out of the dump and leaves it in the same step. */
const createFromForm = createTaskSchema.extend({ dumpId: z.string().min(1).max(60).optional() });

export function POST(req: Request) {
  return adminRoute(req, createFromForm, ({ dumpId, ...input }, session) => createOneOffTask(realTaskDb(session.orgId), session, input, { dumpId }));
}

export function PATCH(req: Request) {
  return adminRoute(req, updateTaskSchema, async (input, session) => {
    await updateOneOffTask(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
