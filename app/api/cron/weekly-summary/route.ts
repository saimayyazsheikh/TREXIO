import { NextResponse } from "next/server";
import { DomainError } from "@/lib/domain/errors";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { generateWeeklySummary } from "@/lib/server/ai-summary";
import { realSummaryDeps } from "@/lib/server/ai-summary-deps";

export const dynamic = "force-dynamic";

/** Monday morning: writes last week's summary once. Also callable by an external pinger; repeats are skipped. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await generateWeeklySummary(realSummaryDeps(), { which: "last-week", trigger: "cron" }));
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("weekly-summary failed", error);
    return NextResponse.json({ error: "Summary failed." }, { status: 500 });
  }
}
