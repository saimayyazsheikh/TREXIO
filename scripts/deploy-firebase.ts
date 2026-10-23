/**
 * Publishes the Firestore rules, Realtime Database rules and Firestore indexes to the real project, using only the Admin
 * credentials in .env.local (the same ones the app uses). Use it when `firebase deploy` is not available, for example because
 * the service account may not call Google's service-usage API.
 *
 *   npm run deploy:firebase
 *
 * Safe to run again: rules are replaced by the current files, and indexes that already exist are skipped.
 */
import { existsSync, readFileSync } from "fs";
import { getDatabase } from "firebase-admin/database";
import { getSecurityRules } from "firebase-admin/security-rules";
import { initAdminApp, usingEmulators } from "../lib/server/admin-config";

type IndexField = { fieldPath: string; order?: string; arrayConfig?: string };
type IndexDef = {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
};
type FieldOverride = {
  collectionGroup: string;
  fieldPath: string;
  ttl?: boolean;
};

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (usingEmulators())
    throw new Error(
      "Refusing to run against emulators. This publishes to the real project.",
    );

  const app = initAdminApp();
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;
  console.log(`Publishing to project ${projectId}`);

  await getSecurityRules(app).releaseFirestoreRulesetFromSource(
    readFileSync("firestore.rules", "utf8"),
  );
  console.log("OK  Firestore rules published");

  await getDatabase(app).setRules(readFileSync("database.rules.json", "utf8"));
  console.log("OK  Realtime Database rules published");

  const token = (await app.options.credential!.getAccessToken()).access_token;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      body: (await res.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string };
      },
    };
  };

  const config = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as {
    indexes: IndexDef[];
    fieldOverrides?: FieldOverride[];
  };
  let created = 0;
  let existing = 0;
  let denied = false;
  for (const idx of config.indexes) {
    const r = await call(
      "POST",
      `${base}/collectionGroups/${idx.collectionGroup}/indexes`,
      { queryScope: idx.queryScope, fields: idx.fields },
    );
    if (r.status === 200) created++;
    else if (r.status === 409 || r.body.error?.status === "ALREADY_EXISTS")
      existing++;
    else if (r.status === 403) {
      denied = true;
      break;
    } else
      throw new Error(
        `Index on ${idx.collectionGroup} failed: ${r.status} ${r.body.error?.message ?? ""}`,
      );
  }
  if (denied) {
    console.log(
      "WARN Firestore indexes NOT created: this service account may not manage indexes.",
    );
    console.log(
      "     Fix once: Google Cloud console > IAM > find",
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      "> Edit > add the role 'Cloud Datastore Index Admin'. Then run this again.",
    );
    console.log(
      "     (Or, as the project owner: npx firebase-tools login, then npx firebase-tools deploy --only firestore:indexes --project",
      projectId + ")",
    );
    return;
  }
  console.log(
    `OK  Firestore indexes: ${created} started building, ${existing} already there`,
  );

  for (const f of config.fieldOverrides ?? []) {
    if (!f.ttl) continue;
    const r = await call(
      "PATCH",
      `${base}/collectionGroups/${f.collectionGroup}/fields/${f.fieldPath}?updateMask=ttlConfig`,
      { ttlConfig: {} },
    );
    if (r.status !== 200 && r.status !== 409)
      throw new Error(
        `TTL on ${f.collectionGroup}.${f.fieldPath} failed: ${r.status} ${r.body.error?.message ?? ""}`,
      );
    console.log(
      `OK  Automatic cleanup (TTL) on ${f.collectionGroup}.${f.fieldPath}`,
    );
  }
  console.log(
    "Done. New indexes can take a few minutes to finish building (Firebase console > Firestore > Indexes).",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
