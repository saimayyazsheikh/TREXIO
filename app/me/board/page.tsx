import { BoardView } from "@/components/features/kanban/board-view";
import { requireRole } from "@/lib/server/session";

export const metadata = { title: "My board" };

export default async function MyBoardPage() {
  const session = await requireRole("employee");
  return <BoardView viewer={{ uid: session.uid, role: "employee" }} />;
}
