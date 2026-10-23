import { adminRoute } from "@/lib/server/api-auth";
import { reminderSchema } from "@/lib/domain/communication";
import { sendReminder } from "@/lib/server/communication";
import { realDocDb } from "@/lib/server/doc-db";

/** Sends a reminder to chosen employees (or everyone). Files are uploaded first under reminders/<id>/. */
export function POST(req: Request) {
  return adminRoute(req, reminderSchema, (input, session) => sendReminder(realDocDb(session.orgId), session, input));
}
