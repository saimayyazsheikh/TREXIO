import { EmployeeShell } from "@/components/shell/employee-shell";
import { OrgScope } from "@/components/shell/org-scope";
import { requireRole } from "@/lib/server/session";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("employee");
  return (
    <OrgScope orgId={session.orgId}>
      <EmployeeShell userName={session.name} uid={session.uid}>
        {children}
      </EmployeeShell>
    </OrgScope>
  );
}

