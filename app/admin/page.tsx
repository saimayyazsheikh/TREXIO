import Link from "next/link";
import { Building2, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        description="Start by adding your businesses, then invite their teams. Tasks, journals and live status will appear here as soon as work starts."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/admin/settings/businesses">
                <Building2 aria-hidden /> Add businesses
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin/settings/team">
                <Users aria-hidden /> Add team members
              </Link>
            </Button>
          </div>
        }
      />
    </>
  );
}
