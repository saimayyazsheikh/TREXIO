import { AdminDashboard } from "@/components/features/dashboard/admin-dashboard";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const session = await requireRole("admin");
  return <AdminDashboard firstName={session.name.split(" ")[0]} />;
}
