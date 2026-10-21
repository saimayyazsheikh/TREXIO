import { MyRemindersView } from "@/components/features/reminders/my-reminders-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Reminders" };

export default async function MyRemindersPage() {
  const session = await requireRole("employee");
  return <MyRemindersView uid={session.uid} />;
}
