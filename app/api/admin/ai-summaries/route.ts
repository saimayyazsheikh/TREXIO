import { z } from "zod";
import { adminRoute } from "@/lib/server/api-auth";
import { generateWeeklySummary } from "@/lib/server/ai-summary";
import { realSummaryDeps } from "@/lib/server/ai-summary-deps";

const schema = z.object({ which: z.enum(["last-week", "this-week"]) });

/** "Generate now": summarise the last finished week, or the week so far. Only aggregated figures leave the server. */
export function POST(req: Request) {
  return adminRoute(req, schema, (input, session) => generateWeeklySummary(realSummaryDeps(session.orgId), { which: input.which, trigger: "manual" }));
}
