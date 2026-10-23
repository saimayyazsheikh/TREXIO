import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { runBriefing } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";
import { generateWeeklySummary } from "@/lib/server/ai-summary";
import { realSummaryDeps } from "@/lib/server/ai-summary-deps";
import { forEachOrg } from "@/lib/server/org-scope";
import { pktIsoWeekday } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * 09:00 PKT (04:00 UTC): tells each employee what is on for today, in every workspace, once per person per day. On Mondays
 * it also writes last week's AI summary for each workspace, because Vercel Hobby allows only two cron entries (the summary
 * is idempotent, and its failure never blocks the briefing).
 */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const monday = pktIsoWeekday() === 1;
  const runs = await forEachOrg(adminDb(), async (orgId) => {
    const briefing = await runBriefing(realAutomationDeps(orgId));
    const weekly = monday
      ? await Promise.resolve()
          .then(() => generateWeeklySummary(realSummaryDeps(orgId), { which: "last-week", trigger: "cron" }))
          .catch((error) => {
            console.error(`weekly summary failed for ${orgId}`, error);
            return { error: "Summary failed." };
          })
      : null;
    return { briefing, weekly };
  });
  return NextResponse.json({ workspaces: runs.length, failed: runs.filter((r) => !r.ok).length, sent: runs.reduce((n, r) => n + (r.result?.briefing.sent ?? 0), 0), weekly: monday }, { status: runs.every((r) => r.ok) ? 200 : 500 });
}
