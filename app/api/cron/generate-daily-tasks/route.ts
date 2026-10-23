import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { forEachOrg } from "@/lib/server/org-scope";
import { realGenerationDeps } from "@/lib/server/task-db";
import { pktDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Creates today's task for every routine in every workspace. Safe to run any number of times. (Also part of /api/cron/daily.) */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const date = pktDateString();
  const runs = await forEachOrg(adminDb(), (orgId) => generateDailyTasks(realGenerationDeps(orgId), { date }));
  return NextResponse.json({ date, workspaces: runs.length, created: runs.reduce((n, r) => n + (r.result?.created ?? 0), 0), failed: runs.filter((r) => !r.ok).length }, { status: runs.every((r) => r.ok) ? 200 : 500 });
}
