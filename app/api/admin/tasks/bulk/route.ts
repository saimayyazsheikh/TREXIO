import { adminRoute } from "@/lib/server/api-auth";
import { bulkSchema } from "@/lib/domain/bulk";
import { bulkChangeTasks } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Priority, day, assignee or delete for several one-off tasks at once. Reports which ones couldn't change. */
export function POST(req: Request) {
  return adminRoute(req, bulkSchema, (input, session) => bulkChangeTasks(realTaskDb(session.orgId), session, input));
}
