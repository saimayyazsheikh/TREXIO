import { z } from "zod";
import { employeeRoute } from "@/lib/server/api-auth";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { realGenerationDeps } from "@/lib/server/task-db";
import { pktDateString } from "@/lib/time";

/** Lazy safety net: an employee opening their dashboard makes sure today's routines exist (idempotent). */
export function POST(req: Request) {
  return employeeRoute(req, z.object({}), (_input, session) =>
    generateDailyTasks(realGenerationDeps(), { date: pktDateString(), employeeId: session.uid }),
  );
}
