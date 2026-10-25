import { adminRoute } from "@/lib/server/api-auth";
import { updateDailyTodaySchema } from "@/lib/domain/task-schemas";
import { updateDailyForToday } from "@/lib/server/task-store";
import { realTaskDb } from "@/lib/server/task-db";

/** Edits one day's copy of a daily routine ("just today"). Changing the routine itself goes through /api/admin/templates. */
export function PATCH(req: Request) {
  return adminRoute(req, updateDailyTodaySchema, async (input, session) => {
    await updateDailyForToday(realTaskDb(session.orgId), session, input);
    return { ok: true };
  });
}
