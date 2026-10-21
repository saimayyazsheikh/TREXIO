import { TodayView } from "@/components/features/tasks/today-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Today" };

export default async function EmployeeToday() {
  const session = await requireRole("employee");
  return <TodayView uid={session.uid} />;
}
