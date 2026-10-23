import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { realDocDb } from "@/lib/server/doc-db";
import { forEachOrg } from "@/lib/server/org-scope";
import { realGenerationDeps } from "@/lib/server/task-db";
import { finalizeStaleBreaks } from "@/lib/server/time-off";
import { pktDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Nightly (00:05 PKT): for every workspace, creates today's routine tasks and closes forgotten breaks, in one job because
 * Vercel Hobby allows only two cron entries. Each step is idempotent, and one workspace failing never stops the others.
 */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const date = pktDateString();
  const runs = await forEachOrg(adminDb(), async (orgId) => ({
    tasks: await generateDailyTasks(realGenerationDeps(orgId), { date }),
    breaks: await finalizeStaleBreaks(realDocDb(orgId)),
  }));
  return NextResponse.json({ date, workspaces: runs.length, failed: runs.filter((r) => !r.ok).length, runs }, { status: runs.every((r) => r.ok) ? 200 : 500 });
}
