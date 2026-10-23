import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { realDocDb } from "@/lib/server/doc-db";
import { forEachOrg } from "@/lib/server/org-scope";
import { finalizeStaleBreaks } from "@/lib/server/time-off";

export const dynamic = "force-dynamic";

/** Closes breaks left running past midnight, in every workspace. Safe to run any number of times. (Also part of /api/cron/daily.) */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const runs = await forEachOrg(adminDb(), (orgId) => finalizeStaleBreaks(realDocDb(orgId)));
  return NextResponse.json({ workspaces: runs.length, closed: runs.reduce((n, r) => n + (r.result?.closed ?? 0), 0), failed: runs.filter((r) => !r.ok).length }, { status: runs.every((r) => r.ok) ? 200 : 500 });
}
