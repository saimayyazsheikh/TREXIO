import { adminRoute } from "@/lib/server/api-auth";
import { employeeStatusSchema } from "@/lib/domain/schemas";
import { setEmployeeStatus } from "@/lib/server/employees";
import { realEmployeeDeps } from "@/lib/server/employees-deps";

type Ctx = { params: Promise<{ uid: string }> };

/** Disables or re-enables a login and ends any live sessions. */
export async function POST(req: Request, { params }: Ctx) {
  const { uid } = await params;
  return adminRoute(req, employeeStatusSchema, async ({ status }) => {
    await setEmployeeStatus(realEmployeeDeps(), uid, status);
    return { ok: true };
  });
}
