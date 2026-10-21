import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { z } from "zod";

const adminEnvSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
  FIREBASE_DATABASE_URL: z.string().min(1),
});

/** Initialises firebase-admin once. Shared by the Next.js server and `scripts/*` (no `server-only` here). */
export function initAdminApp(env: NodeJS.ProcessEnv = process.env): App {
  if (getApps().length > 0) return getApp();
  const parsed = adminEnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Firebase Admin is not configured (missing: ${missing}).`);
  }
  return initializeApp({
    credential: cert({
      projectId: parsed.data.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: parsed.data.FIREBASE_ADMIN_CLIENT_EMAIL,
      // .env files and Vercel store the PEM with escaped newlines.
      privateKey: parsed.data.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: parsed.data.FIREBASE_DATABASE_URL,
  });
}
