import { z } from "zod";
import { adminRoute } from "@/lib/server/api-auth";
import { runBriefing, runEscalations } from "@/lib/server/automation";
import { realAutomationDeps } from "@/lib/server/automation-deps";

const schema = z.object({ job: z.enum(["escalations", "briefing"]) });

/** "Run now" buttons on the Automation page. Same idempotent jobs as the schedules, so pressing twice does no harm. */
export function POST(req: Request) {
  return adminRoute(req, schema, (input) => (input.job === "escalations" ? runEscalations(realAutomationDeps()) : runBriefing(realAutomationDeps())));
}
