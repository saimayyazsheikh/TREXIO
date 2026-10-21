import { anyRoleRoute } from "@/lib/server/api-auth";
import { leaveActionSchema } from "@/lib/domain/timeoff";
import { realDocDb } from "@/lib/server/doc-db";
import { handleLeave } from "@/lib/server/time-off";

/** Request, cancel and decide on leave and short excuses. */
export function POST(req: Request) {
  return anyRoleRoute(req, leaveActionSchema, (input, session) => handleLeave(realDocDb(), session, input));
}
