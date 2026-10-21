import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/lib/server/admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/session-constants";

const bodySchema = z.object({ idToken: z.string().min(10) });

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(req: Request) {
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const auth = adminAuth();
    const decoded = await auth.verifyIdToken(body.data.idToken, true);
    if (decoded.role !== "admin" && decoded.role !== "employee") {
      return NextResponse.json({ error: "This account has no access yet. Ask your admin." }, { status: 403 });
    }
    // Only accept tokens minted in the last 5 minutes: the cookie must follow a real sign-in.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const cookie = await auth.createSessionCookie(body.data.idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const res = NextResponse.json({ role: decoded.role });
    res.cookies.set(SESSION_COOKIE, cookie, { ...cookieBase, maxAge: SESSION_MAX_AGE_MS / 1000 });
    return res;
  } catch {
    return NextResponse.json({ error: "Could not sign you in. Please try again." }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
