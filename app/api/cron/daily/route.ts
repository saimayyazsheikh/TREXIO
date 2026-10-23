import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { realDocDb } from "@/lib/server/doc-db";
import { realGenerationDeps } from "@/lib/server/task-db";
import { finalizeStaleBreaks } from "@/lib/server/time-off";
import { pktDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Nightly (00:05 PKT): creates today's routine tasks and closes forgotten breaks, in one job because Vercel Hobby
 * allows only two cron entries. Each step is idempotent and reports its own result.
 */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const date = pktDateString();
  const [tasks, breaks] = await Promise.allSettled([generateDailyTasks(realGenerationDeps(), { date }), finalizeStaleBreaks(realDocDb())]);
  for (const r of [tasks, breaks]) if (r.status === "rejected") console.error("daily job step failed", r.reason);
  const body = {
    date,
    tasks: tasks.status === "fulfilled" ? tasks.value : { error: "Generation failed." },
    breaks: breaks.status === "fulfilled" ? breaks.value : { error: "Closing breaks failed." },
  };
  return NextResponse.json(body, { status: tasks.status === "fulfilled" && breaks.status === "fulfilled" ? 200 : 500 });
}
