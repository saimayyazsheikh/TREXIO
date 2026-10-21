import { adminRoute } from "@/lib/server/api-auth";
import { createEmployeeSchema } from "@/lib/domain/schemas";
import { createEmployee } from "@/lib/server/employees";
import { realEmployeeDeps } from "@/lib/server/employees-deps";

/** Creates an employee login + profile and sets their role/business claims. */
export function POST(req: Request) {
  return adminRoute(req, createEmployeeSchema, (input) => createEmployee(realEmployeeDeps(), input));
}
