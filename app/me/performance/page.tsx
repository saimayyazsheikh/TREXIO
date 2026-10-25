import { PageHeader } from "@/components/features/page-header";
import { PerformanceReport } from "@/components/features/reports/performance-report";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "My performance" };

export default async function MyPerformancePage() {
  const session = await requireRole("employee");
  return (
    <>
      <div className="print:hidden">
        <PageHeader title="My performance" subtitle="The tasks you finished and the ones you didn't, your journal and attendance. Download it as a PDF to keep or share." />
      </div>
      <PerformanceReport employeeId={session.uid} />
    </>
  );
}
