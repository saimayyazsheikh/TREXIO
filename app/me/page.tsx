import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/features/empty-state";
import { PageHeader } from "@/components/features/page-header";
import { formatPkt } from "@/lib/time";

export const metadata = { title: "Today" };

export default function EmployeeToday() {
  return (
    <>
      <PageHeader title="Today" subtitle={`${formatPkt(new Date(), "EEEE, d MMMM")} · your tasks for the day appear here.`} />
      <EmptyState
        icon={ListChecks}
        title="Nothing assigned yet"
        description="When your admin gives you work for today, it will show up here for you to check off."
      />
    </>
  );
}
