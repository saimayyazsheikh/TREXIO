/**
 * Creates (or repairs) the single admin account.
 *
 *   npm run seed:admin -- --email owner@example.com --password "a-long-password" --name "Your Name"
 *
 * Reads Firebase Admin credentials from .env.local. Safe to run again: it updates the same user.
 */
import { existsSync } from "fs";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initAdminApp } from "../lib/server/admin-config";
import { upsertAdmin } from "./lib/admin-account";

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
  const { created } = await upsertAdmin(getAuth(app), getFirestore(app), { email, password, name });
  console.log(`${created ? "Created" : "Updated existing"} admin ${email}`);
  console.log("Done. Sign in at /login with that email and password.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
