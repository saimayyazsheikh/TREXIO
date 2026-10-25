import { employeeRoute } from "@/lib/server/api-auth";
import { reminderResponseSchema } from "@/lib/domain/communication";
import { respondToReminder } from "@/lib/server/communication";
import { realDocDb } from "@/lib/server/doc-db";

/** A team member answers a reminder: got it, completed, or ask about it. */
export function POST(req: Request) {
  return employeeRoute(req, reminderResponseSchema, (input, session) => respondToReminder(realDocDb(session.orgId), session, input));
}
