import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-constants";

/**
 * Cheap, edge-safe routing guard (UX only). It reads the role from the session cookie payload *without*
 * verifying the signature; real verification happens in server layouts (`requireRole`) and in Firestore and database rules.
 */
function roleFromCookie(token: string | undefined): "admin" | "employee" | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.role === "admin" || json.role === "employee" ? json.role : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = roleFromCookie(req.cookies.get(SESSION_COOKIE)?.value);
  const home = role === "admin" ? "/admin" : "/me";

  if (pathname === "/login") {
    return role ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  }
  if (!role) return NextResponse.redirect(new URL("/login", req.url));
  if (pathname.startsWith("/admin") && role !== "admin") return NextResponse.redirect(new URL(home, req.url));
  if (pathname.startsWith("/me") && role !== "employee") return NextResponse.redirect(new URL(home, req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/admin/:path*", "/me/:path*"] };
