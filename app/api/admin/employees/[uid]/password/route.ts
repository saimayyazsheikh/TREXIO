import { adminRoute } from "@/lib/server/api-auth";
import { resetPasswordSchema } from "@/lib/domain/schemas";
import { resetEmployeePassword } from "@/lib/server/employees";
import { realEmployeeDeps } from "@/lib/server/employees-deps";

type Ctx = { params: Promise<{ uid: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { uid } = await params;
  return adminRoute(req, resetPasswordSchema, async ({ password }, session) => {
    await resetEmployeePassword(await realEmployeeDeps(session.orgId), uid, password);
    return { ok: true };
  });
}
