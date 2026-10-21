import { ChatView } from "@/components/features/chat/chat-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Chat" };

export default async function MyChatPage() {
  const session = await requireRole("employee");
  return <ChatView viewer={{ uid: session.uid, name: session.name, role: "employee" }} />;
}
