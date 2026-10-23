import { adminRoute } from "@/lib/server/api-auth";
import { adminDb } from "@/lib/server/admin";
import { nudgeSchema, sendTaskNudge } from "@/lib/server/nudge";
import { realWhatsApp } from "@/lib/server/whatsapp-real";

/** Admin only: send a WhatsApp nudge about a task to one of its assignees. */
export function POST(req: Request) {
  return adminRoute(req, nudgeSchema, (input) =>
    sendTaskNudge(
      {
        get: async (path) => {
          const snap = await adminDb().doc(path).get();
          return snap.exists ? (snap.data() as Record<string, unknown>) : null;
        },
        wa: realWhatsApp(),
      },
      input,
    ),
  );
}
