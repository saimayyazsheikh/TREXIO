import { InboxView } from "@/components/features/questions/inbox-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const session = await requireRole("admin");
  return <InboxView adminUid={session.uid} />;
}
