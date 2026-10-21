import { anyRoleRoute } from "@/lib/server/api-auth";
import { subtaskToggleSchema } from "@/lib/domain/task-schemas";
import { toggleSubtask } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

export function POST(req: Request) {
  return anyRoleRoute(req, subtaskToggleSchema, async (input, session) => {
    await toggleSubtask(realTaskDb(), session, input);
    return { ok: true };
  });
}
