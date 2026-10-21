import "server-only";
import { adminDb } from "@/lib/server/admin";
import type { GenerationDeps } from "@/lib/server/daily-generation";
import { createGenerationDeps, createTaskDb } from "@/lib/server/task-db-core";
import type { TaskDb } from "@/lib/server/task-store";

export const realTaskDb = (): TaskDb => createTaskDb(adminDb());
export const realGenerationDeps = (): GenerationDeps => createGenerationDeps(adminDb());
