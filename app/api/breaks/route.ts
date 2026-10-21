import { employeeRoute } from "@/lib/server/api-auth";
import { breakActionSchema } from "@/lib/domain/timeoff";
import { realDocDb } from "@/lib/server/doc-db";
import { handleBreak } from "@/lib/server/time-off";

/** Start or end your break. */
export function POST(req: Request) {
  return employeeRoute(req, breakActionSchema, (input, session) => handleBreak(realDocDb(), session, input));
}
