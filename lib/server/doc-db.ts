import "server-only";
import { adminDb } from "@/lib/server/admin";
import type { DocDb } from "@/lib/server/communication";
import { createDocDb } from "@/lib/server/doc-db-core";
import { scopeDb } from "@/lib/server/org-scope";
import { pushNotice } from "@/lib/server/push";

export const realDocDb = (orgId: string): DocDb => createDocDb(scopeDb(adminDb(), orgId), pushNotice);
