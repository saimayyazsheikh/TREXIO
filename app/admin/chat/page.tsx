import { ChatView } from "@/components/features/chat/chat-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Chat" };

export default async function AdminChatPage() {
  const session = await requireRole("admin");
  return <ChatView viewer={{ uid: session.uid, name: session.name, role: "admin" }} />;
}
