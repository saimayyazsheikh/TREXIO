import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { runBriefing } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";

export const dynamic = "force-dynamic";

/** 09:00 PKT (04:00 UTC): sends each employee today's tasks on WhatsApp, once per person per day. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await runBriefing(realAutomationDeps()));
  } catch (error) {
    console.error("morning-briefing failed", error);
    return NextResponse.json({ error: "Briefing failed." }, { status: 500 });
  }
}
