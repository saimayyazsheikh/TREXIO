import { EmployeeDetailView } from "@/components/features/employees/employee-detail-view";

export const metadata = { title: "Team member" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeDetailView employeeId={id} />;
}
