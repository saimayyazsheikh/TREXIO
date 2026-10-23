import { AdminShell } from "@/components/shell/admin-shell";
import { OrgScope } from "@/components/shell/org-scope";
import { requireRole } from "@/lib/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  return (
    <OrgScope orgId={session.orgId}>
      <AdminShell userName={session.name} uid={session.uid}>
        {children}
      </AdminShell>
    </OrgScope>
  );
}

