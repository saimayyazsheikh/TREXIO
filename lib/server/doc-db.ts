import "server-only";
import { adminDb } from "@/lib/server/admin";
import type { DocDb } from "@/lib/server/communication";
import { createDocDb } from "@/lib/server/doc-db-core";

export const realDocDb = (): DocDb => createDocDb(adminDb());
