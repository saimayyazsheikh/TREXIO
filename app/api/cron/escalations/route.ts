import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { runEscalations } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";

export const dynamic = "force-dynamic";

/** Every 10 to 15 minutes (an external pinger on Vercel Hobby): raises late-task alerts once each. Safe to repeat. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await runEscalations(realAutomationDeps()));
  } catch (error) {
    console.error("escalations failed", error);
    return NextResponse.json({ error: "Escalation check failed." }, { status: 500 });
  }
}
