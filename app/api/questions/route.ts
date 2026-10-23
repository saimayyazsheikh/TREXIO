import { anyRoleRoute } from "@/lib/server/api-auth";
import { questionActionSchema } from "@/lib/domain/communication";
import { handleQuestion } from "@/lib/server/communication";
import { realDocDb } from "@/lib/server/doc-db";

/** Ask, reply, close/reopen and mark-seen for help questions. */
export function POST(req: Request) {
  return anyRoleRoute(req, questionActionSchema, (input, session) => handleQuestion(realDocDb(session.orgId), session, input));
}
