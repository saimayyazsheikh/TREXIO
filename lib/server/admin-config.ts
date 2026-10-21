import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { z } from "zod";

const adminEnvSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
  FIREBASE_DATABASE_URL: z.string().min(1),
});

/** True when the Admin SDK is pointed at local emulators (it then needs no real credentials). */
export function usingEmulators(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.FIREBASE_AUTH_EMULATOR_HOST && env.FIRESTORE_EMULATOR_HOST);
}

/** Initialises firebase-admin once. Shared by the Next.js server and `scripts/*` (no `server-only` here). */
export function initAdminApp(env: NodeJS.ProcessEnv = process.env): App {
  if (getApps().length > 0) return getApp();

  if (usingEmulators(env)) {
    // Emulator mode: the SDK talks to localhost using the *_EMULATOR_HOST variables, so a project id is enough.
    return initializeApp({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || "demo-traxio", databaseURL: env.FIREBASE_DATABASE_URL });
  }

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
