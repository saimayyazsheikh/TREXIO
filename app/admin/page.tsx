import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/features/empty-state";
import { PageHeader } from "@/components/features/page-header";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const session = await requireRole("admin");
  const firstName = session.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} subtitle="Today across all your businesses, in one place." />
      <EmptyState
        icon={Sparkles}
        title="Your workspace is ready"
        description="Next up: add your businesses and invite your team. Tasks, journals and live status will appear here as soon as work starts."
      />
    </>
  );
}
