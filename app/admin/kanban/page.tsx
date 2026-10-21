import { BoardView } from "@/components/features/kanban/board-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "Kanban" };

export default async function AdminKanbanPage() {
  const session = await requireRole("admin");
  return <BoardView viewer={{ uid: session.uid, role: "admin" }} />;
}
