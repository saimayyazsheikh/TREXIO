import { employeeRoute } from "@/lib/server/api-auth";
import { timerSchema } from "@/lib/domain/task-schemas";
import { startTimer, stopTimer } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Start or stop your own timer on a task you were given. */
export function POST(req: Request) {
  return employeeRoute(req, timerSchema, async (input, session) => {
    const db = realTaskDb(session.orgId);
    await (input.action === "start" ? startTimer(db, session, input) : stopTimer(db, session, input));
    return { ok: true };
  });
}
