import { z } from "zod";

/** Public (browser-safe) Firebase web config. Read via static `process.env.NEXT_PUBLIC_*` so Next inlines them. */
const publicSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
  databaseURL: z.string().min(1),
});

export type FirebasePublicConfig = z.infer<typeof publicSchema>;

export function getFirebasePublicConfig(): FirebasePublicConfig {
  const parsed = publicSchema.safeParse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Firebase web config is incomplete (missing: ${missing}). Copy .env.example to .env.local.`);
  }
  return parsed.data;
}

export const emulatorsEnabled = () => process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
