/**
 * Creates (or repairs) the single admin account.
 *
 *   npm run seed:admin -- --email owner@example.com --password "a-long-password" --name "Your Name"
 *
 * Reads Firebase Admin credentials from .env.local. Safe to run again: it updates the same user.
 */
import { existsSync } from "fs";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initAdminApp } from "../lib/server/admin-config";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const email = (arg("email") ?? process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = arg("password") ?? process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = (arg("name") ?? process.env.SEED_ADMIN_NAME ?? "Admin").trim();
  if (!email.includes("@") || password.length < 8) {
    throw new Error('Usage: npm run seed:admin -- --email you@example.com --password "at least 8 characters" --name "Your Name"');
  }

  const app = initAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName: name, disabled: false });
    console.log(`Updated existing admin ${email}`);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    uid = (await auth.createUser({ email, password, displayName: name })).uid;
    console.log(`Created admin ${email}`);
  }

  await auth.setCustomUserClaims(uid, { role: "admin" });
  await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).set(
    {
      role: "admin",
      name,
      username: null,
      email,
      contactEmail: email,
      phone: null,
      photoUrl: null,
      businessId: null,
      designation: "Owner",
      status: "active",
      workStart: null,
      workEnd: null,
      idleThresholdMin: null,
      fcmTokens: [],
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log("Done. Sign in at /login with that email and password.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
