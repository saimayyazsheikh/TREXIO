import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import type { Notice } from "@/lib/server/communication";
import { adminDb } from "@/lib/server/admin";
import { initAdminApp } from "@/lib/server/admin-config";

const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/** Browser push for a saved notice: the same words as the bell. Never throws; the bell is the source of truth. */
export async function pushNotice(n: Notice): Promise<void> {
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") return;
  try {
    const db = adminDb();
    const tokens =
      n.toUid === "admin"
        ? (await db.collection("users").where("role", "==", "admin").get()).docs.flatMap((d) => (d.get("fcmTokens") as string[] | undefined) ?? [])
        : (((await db.doc(`users/${n.toUid}`).get()).get("fcmTokens") as string[] | undefined) ?? []);
    if (tokens.length === 0) return;
    const res = await getMessaging(initAdminApp()).sendEachForMulticast({
      tokens,
      notification: { title: n.title, body: n.body },
      data: { link: n.link },
      webpush: { fcmOptions: { link: n.link } },
    });
    await Promise.all(
      res.responses.map(async (r, i) => {
        if (r.success || !DEAD_TOKEN.has(r.error?.code ?? "")) return;
        const owners = await db.collection("users").where("fcmTokens", "array-contains", tokens[i]).get();
        await Promise.all(owners.docs.map((d) => d.ref.update({ fcmTokens: FieldValue.arrayRemove(tokens[i]) })));
      }),
    );
  } catch (error) {
    console.error("push failed", error);
  }
}
