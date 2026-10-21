import { MyQuestionsView } from "@/components/features/questions/my-questions-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Ask a question" };

export default async function AskPage() {
  const session = await requireRole("employee");
  return <MyQuestionsView uid={session.uid} />;
}
