import "server-only";
import { adminDb } from "@/lib/server/admin";
import { scopeDb } from "@/lib/server/org-scope";
import type { GenerationDeps } from "@/lib/server/daily-generation";
import { createGenerationDeps, createTaskDb } from "@/lib/server/task-db-core";
import type { TaskDb } from "@/lib/server/task-store";

export const realTaskDb = (orgId: string): TaskDb => createTaskDb(scopeDb(adminDb(), orgId));
export const realGenerationDeps = (orgId: string): GenerationDeps => createGenerationDeps(scopeDb(adminDb(), orgId));
