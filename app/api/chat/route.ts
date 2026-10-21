import { anyRoleRoute } from "@/lib/server/api-auth";
import { chatActionSchema } from "@/lib/domain/communication";
import { handleChat } from "@/lib/server/communication";
import { realDocDb } from "@/lib/server/doc-db";

/** Send, mark read, edit, delete and react in chat. */
export function POST(req: Request) {
  return anyRoleRoute(req, chatActionSchema, (input, session) => handleChat(realDocDb(), session, input));
}
