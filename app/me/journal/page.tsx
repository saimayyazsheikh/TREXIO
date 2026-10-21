import { JournalView } from "@/components/features/journal/journal-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Journal" };

export default async function JournalPage() {
  const session = await requireRole("employee");
  return <JournalView uid={session.uid} />;
}
