import { employeeRoute } from "@/lib/server/api-auth";
import { personalStepSchema } from "@/lib/domain/task-schemas";
import { updatePersonalSteps } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** The steps an employee keeps for themselves on a task they were given. */
export function POST(req: Request) {
  return employeeRoute(req, personalStepSchema, async (input, session) => {
    await updatePersonalSteps(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
