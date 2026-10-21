import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/logout");
  redirect(session.role === "admin" ? "/admin" : "/me");
}
