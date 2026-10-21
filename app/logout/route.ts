import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-constants";

/** Clears the session cookie and returns to the login page (used when a cookie is stale or revoked). */
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
