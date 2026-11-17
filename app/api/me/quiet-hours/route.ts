import { anyRoleRoute } from "@/lib/server/api-auth";
import { adminDb } from "@/lib/server/admin";
import { scopeDb } from "@/lib/server/org-scope";
import { quietHoursSchema } from "@/lib/domain/quiet-hours";

/** Saves when this person's phone and browser alerts stay silent. Only their own profile is touched. */
export function POST(req: Request) {
  return anyRoleRoute(req, quietHoursSchema, async (input, session) => {
    await scopeDb(adminDb(), session.orgId).doc(`users/${session.uid}`).update({ quietHours: input.enabled ? { from: input.from, to: input.to } : null });
    return { ok: true };
  });
}
