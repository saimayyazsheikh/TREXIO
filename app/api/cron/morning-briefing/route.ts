import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { runBriefing } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";
import { generateWeeklySummary } from "@/lib/server/ai-summary";
import { realSummaryDeps } from "@/lib/server/ai-summary-deps";
import { pktIsoWeekday } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * 09:00 PKT (04:00 UTC): sends each employee today's tasks on WhatsApp, once per person per day. On Mondays it also writes
 * last week's AI summary, because Vercel Hobby allows only two cron entries (the summary is idempotent and its failure never
 * blocks the briefing).
 */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  try {
    const briefing = await runBriefing(realAutomationDeps());
    let weekly: unknown = null;
    if (pktIsoWeekday() === 1) {
      weekly = await Promise.resolve()
        .then(() =>
          generateWeeklySummary(realSummaryDeps(), {
            which: "last-week",
            trigger: "cron",
          }),
        )
        .catch((error) => {
          console.error("weekly summary failed", error);
          return { error: "Summary failed." };
        });
    }
    return NextResponse.json({ ...briefing, weekly });
  } catch (error) {
    console.error("morning-briefing failed", error);
    return NextResponse.json({ error: "Briefing failed." }, { status: 500 });
  }
}
