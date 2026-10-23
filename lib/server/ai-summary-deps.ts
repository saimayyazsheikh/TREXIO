import "server-only";
import { adminDb } from "@/lib/server/admin";
import { scopeDb } from "@/lib/server/org-scope";
import { providerFromEnv } from "@/lib/server/ai";
import { createSummaryDeps } from "@/lib/server/ai-summary-deps-core";
import type { SummaryDeps } from "@/lib/server/ai-summary";
import { pushNotice } from "@/lib/server/push";

/** Which AI the server is set up for (or the built-in template when no key is set). Throws if AI_PROVIDER names a provider with no key. */
export const realSummaryDeps = (orgId: string): SummaryDeps =>
  createSummaryDeps(
    scopeDb(adminDb(), orgId),
    providerFromEnv({
      AI_PROVIDER: process.env.AI_PROVIDER,
      AI_MODEL: process.env.AI_MODEL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
    }),
    pushNotice,
  );
