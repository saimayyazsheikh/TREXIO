import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { z } from "zod";

const adminEnvSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
  FIREBASE_DATABASE_URL: z.string().min(1),
});

function adminApp(): App {
  if (getApps().length > 0) return getApp();
  const env = adminEnvSchema.safeParse(process.env);
  if (!env.success) {
    const missing = env.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Firebase Admin is not configured (missing: ${missing}).`);
  }
  return initializeApp({
    credential: cert({
      projectId: env.data.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.data.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel/.env store the PEM with escaped newlines.
      privateKey: env.data.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: env.data.FIREBASE_DATABASE_URL,
  });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
export const adminRtdb = () => getDatabase(adminApp());
