import { adminRoute } from "@/lib/server/api-auth";
import { updateEmployeeSchema } from "@/lib/domain/schemas";
import { updateEmployee } from "@/lib/server/employees";
import { realEmployeeDeps } from "@/lib/server/employees-deps";

type Ctx = { params: Promise<{ uid: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { uid } = await params;
  return adminRoute(req, updateEmployeeSchema, async (input) => {
    await updateEmployee(realEmployeeDeps(), uid, input);
    return { ok: true };
  });
}
