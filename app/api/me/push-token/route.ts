import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { anyRoleRoute } from "@/lib/server/api-auth";
import { adminDb } from "@/lib/server/admin";

const MAX_TOKENS = 8;
const schema = z.object({ action: z.enum(["add", "remove"]), token: z.string().min(20).max(4096) });

/** Remembers (or forgets) this browser's push token for the signed-in user. Newest tokens win when someone has many devices. */
export function POST(req: Request) {
  return anyRoleRoute(req, schema, async (input, session) => {
    const ref = adminDb().doc(`users/${session.uid}`);
    if (input.action === "remove") {
      await ref.update({ fcmTokens: FieldValue.arrayRemove(input.token) });
      return { ok: true };
    }
    await adminDb().runTransaction(async (t) => {
      const current = ((await t.get(ref)).get("fcmTokens") as string[] | undefined) ?? [];
      const next = [...current.filter((x) => x !== input.token), input.token].slice(-MAX_TOKENS);
      t.update(ref, { fcmTokens: next });
    });
    return { ok: true };
  });
}
