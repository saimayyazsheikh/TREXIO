import { adminRoute } from "@/lib/server/api-auth";
import { createTemplateSchema, updateTemplateSchema } from "@/lib/domain/task-schemas";
import { generateDailyTasks } from "@/lib/server/daily-generation";
import { createTemplate, updateTemplate } from "@/lib/server/templates";
import { realGenerationDeps, realTaskDb } from "@/lib/server/task-db";
import { adminDb } from "@/lib/server/admin";
import { scopeDb } from "@/lib/server/org-scope";
import { pktDateString } from "@/lib/time";

/** Creates a daily routine and, if it runs today, immediately gives the employee today's copy. */
export function POST(req: Request) {
  return adminRoute(req, createTemplateSchema, async (input, session) => {
    const { templateId } = await createTemplate(realTaskDb(session.orgId), session, input);
    await generateDailyTasks(realGenerationDeps(session.orgId), { date: pktDateString(), employeeId: input.employeeId });
    return { templateId };
  });
}

export function PATCH(req: Request) {
  return adminRoute(req, updateTemplateSchema, async (input, session) => {
    await updateTemplate(realTaskDb(session.orgId), session, input);
    // A resumed routine (or newly added day) should show up today without waiting for the nightly job.
    const employeeId = (await scopeDb(adminDb(), session.orgId).doc(`taskTemplates/${input.templateId}`).get()).get("employeeId") as string | undefined;
    if (employeeId) await generateDailyTasks(realGenerationDeps(session.orgId), { date: pktDateString(), employeeId });
    return { ok: true };
  });
}
