import type { OrgDb } from "@/lib/server/org-scope";
import type { Notice } from "@/lib/server/communication";
import { createAutomationDeps } from "@/lib/server/automation-deps-core";
import { loadAnalyticsInput } from "@/lib/server/analytics-load";
import type { AiProvider } from "@/lib/server/ai";
import type { SummaryDeps } from "@/lib/server/ai-summary";

/** The weekly summary wired to a Firestore instance (the real project or the emulator). */
export function createSummaryDeps(db: OrgDb, provider: AiProvider, push: (orgId: string, n: Notice) => Promise<void>): SummaryDeps {
  const shared = createAutomationDeps(db, push);
  return {
    now: () => new Date(),
    provider,
    loadInput: (p) => loadAnalyticsInput(db, p.from, p.to),
    save: async (id, doc) => void (await db.doc(`aiSummaries/${id}`).set(doc)),
    claimRun: shared.claimRun,
    releaseRun: async (key) => void (await db.doc(`automationRuns/${key}`).delete()),
    notify: shared.notify,
  };
}
