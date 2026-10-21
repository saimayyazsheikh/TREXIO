import { MyLeaveView } from "@/components/features/leave/my-leave-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Leave & breaks" };

export default async function MyLeavePage() {
  const session = await requireRole("employee");
  return <MyLeaveView uid={session.uid} />;
}
