/**
 * Creates an owner (admin of a brand-new workspace) with an email and password. In the real app owners sign up with
 * Google, so you normally don't need this; it is an emergency way in.
 *
 *   npm run seed:admin -- --email owner@example.com --password "a-long-password" --name "Your Name" --workspace "Acme Traders"
 *
 * Reads Firebase Admin credentials from .env.local. Safe to run again: it updates the same user and keeps their workspace.
 */
import { existsSync } from "fs";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initAdminApp } from "../lib/server/admin-config";
import { upsertOwner } from "./lib/admin-account";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const email = (arg("email") ?? process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = arg("password") ?? process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = (arg("name") ?? process.env.SEED_ADMIN_NAME ?? "Admin").trim();
  const workspaceName = (arg("workspace") ?? process.env.SEED_WORKSPACE_NAME ?? `${name}'s workspace`).trim();
  const code = arg("code");
  if (!email.includes("@") || password.length < 8) {
    throw new Error('Usage: npm run seed:admin -- --email you@example.com --password "at least 8 characters" --name "Your Name" --workspace "Your Company"');
  }

  const app = initAdminApp();
  const { created, code: workspaceCode } = await upsertOwner(getAuth(app), getFirestore(app), { email, password, name, workspaceName, code });
  console.log(`${created ? "Created" : "Updated existing"} owner ${email}`);
  console.log(`Workspace code for the team: ${workspaceCode}`);
  console.log("Done. Sign in at /login with that email and password, or with Google if the email is a Google account.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
