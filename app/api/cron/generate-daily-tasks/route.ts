import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { realGenerationDeps } from "@/lib/server/task-db";
import { pktDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Nightly job (00:05 PKT): creates today's task for every routine. Safe to run any number of times. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  try {
    const date = pktDateString();
    const result = await generateDailyTasks(realGenerationDeps(), { date });
    return NextResponse.json({ date, ...result });
  } catch (error) {
    console.error("generate-daily-tasks failed", error);
    return NextResponse.json({ error: "Generation failed." }, { status: 500 });
  }
}
