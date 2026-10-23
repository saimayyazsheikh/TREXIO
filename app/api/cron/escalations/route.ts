import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { runEscalations } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";
import { forEachOrg } from "@/lib/server/org-scope";

export const dynamic = "force-dynamic";

/** Every 10 to 15 minutes (an external pinger on Vercel Hobby): raises late-task alerts once each, in every workspace. Safe to repeat. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const runs = await forEachOrg(adminDb(), (orgId) => runEscalations(realAutomationDeps(orgId)));
  const total = (key: "level1" | "level2") => runs.reduce((n, r) => n + (r.result?.[key] ?? 0), 0);
  return NextResponse.json({ workspaces: runs.length, failed: runs.filter((r) => !r.ok).length, level1: total("level1"), level2: total("level2") }, { status: runs.every((r) => r.ok) ? 200 : 500 });
}
