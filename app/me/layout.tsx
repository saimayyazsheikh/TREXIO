import { EmployeeShell } from "@/components/shell/employee-shell";
import { requireRole } from "@/lib/server/session";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("employee");
  return <EmployeeShell userName={session.name}>{children}</EmployeeShell>;
}
