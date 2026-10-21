import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/server/admin";
import { SESSION_COOKIE } from "@/lib/session-constants";
import type { Role } from "@/lib/domain/constants";

export type Session = { uid: string; role: Role; businessId: string | null; name: string };

/** Verifies the session cookie (including revocation, so disabled users are rejected). */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    const role = decoded.role;
    if (role !== "admin" && role !== "employee") return null;
    return {
      uid: decoded.uid,
      role,
      businessId: typeof decoded.businessId === "string" ? decoded.businessId : null,
      name: decoded.name ?? decoded.email ?? "User",
    };
  } catch {
    return null;
  }
}

/** Page/layout guard: returns the session or redirects. Employees can never enter admin routes and vice-versa. */
export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  // /logout clears a stale cookie first; going straight to /login would loop through the middleware.
  if (!session) redirect("/logout");
  if (session.role !== role) redirect(session.role === "admin" ? "/admin" : "/me");
  return session;
}
