import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession, type Session } from "@/lib/server/session";
import { ServiceError } from "@/lib/server/service-error";

/** Same-origin check for state-changing requests (defence in depth on top of SameSite=Lax cookies). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Runs an admin-only JSON handler: verifies origin + session role, parses the body, maps errors to JSON. */
export async function adminRoute<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
  handler: (input: z.infer<S>, session: Session) => Promise<unknown>,
): Promise<NextResponse> {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid request.", field: first?.path.join(".") }, { status: 400 });
  }
  try {
    return NextResponse.json(await handler(parsed.data, session));
  } catch (error) {
    if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("admin route failed", error);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}
