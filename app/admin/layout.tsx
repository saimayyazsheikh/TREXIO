import { AdminShell } from "@/components/shell/admin-shell";
import { requireRole } from "@/lib/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  return <AdminShell userName={session.name} uid={session.uid}>{children}</AdminShell>;
}

