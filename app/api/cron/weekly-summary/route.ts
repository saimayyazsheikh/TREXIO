import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { generateWeeklySummary } from "@/lib/server/ai-summary";
import { realSummaryDeps } from "@/lib/server/ai-summary-deps";
import { forEachOrg } from "@/lib/server/org-scope";

export const dynamic = "force-dynamic";

/** Monday morning: writes last week's summary once per workspace. Also callable by an external pinger; repeats are skipped. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const runs = await forEachOrg(adminDb(), (orgId) => generateWeeklySummary(realSummaryDeps(orgId), { which: "last-week", trigger: "cron" }));
  return NextResponse.json({ workspaces: runs.length, written: runs.filter((r) => r.ok && !r.result?.skipped).length, failed: runs.filter((r) => !r.ok).length }, { status: runs.every((r) => r.ok) ? 200 : 500 });
}
