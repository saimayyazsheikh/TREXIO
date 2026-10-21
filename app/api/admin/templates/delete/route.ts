import { adminRoute } from "@/lib/server/api-auth";
import { deleteTemplateSchema } from "@/lib/domain/task-schemas";
import { deleteTemplate } from "@/lib/server/templates";
import { realTaskDb } from "@/lib/server/task-db";

export function POST(req: Request) {
  return adminRoute(req, deleteTemplateSchema, async ({ templateId }, session) => {
    await deleteTemplate(realTaskDb(), session, templateId);
    return { ok: true };
  });
}
