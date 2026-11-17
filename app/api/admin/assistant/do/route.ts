import { adminRoute } from "@/lib/server/api-auth";
import { runActionSchema } from "@/lib/domain/assistant-actions";
import { runAssistantAction } from "@/lib/server/assistant-run";
import { realRunDeps } from "@/lib/server/assistant-run-deps";

/** Runs one assistant card the admin confirmed. The payload is checked here again, and a password, if any, is typed into the card. */
export function POST(req: Request) {
  return adminRoute(req, runActionSchema, async (input, session) => runAssistantAction(await realRunDeps(session.orgId, session), input));
}
