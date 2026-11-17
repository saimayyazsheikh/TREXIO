import { z } from "zod";
import { adminRoute } from "@/lib/server/api-auth";
import { MAX_ASSISTANT_MESSAGE } from "@/lib/domain/assistant";
import { askAssistant } from "@/lib/server/assistant";
import { realAssistantDeps } from "@/lib/server/assistant-deps";

export const maxDuration = 60;

const schema = z.object({ message: z.string().trim().min(1, "Write what you need first").max(MAX_ASSISTANT_MESSAGE, `Keep it under ${MAX_ASSISTANT_MESSAGE} characters`) });

/** Turns plain words into proposed tasks for the admin to confirm. Nothing is created here. */
export function POST(req: Request) {
  return adminRoute(req, schema, (input, session) => askAssistant(realAssistantDeps(session.orgId), input));
}
