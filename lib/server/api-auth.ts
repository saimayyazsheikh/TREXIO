import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { Role } from "@/lib/domain/constants";
import { DomainError } from "@/lib/domain/errors";
import { getSession, type Session } from "@/lib/server/session";

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

/** Runs a JSON handler for the given roles: verifies origin + session, parses the body, maps errors to JSON. */
export async function apiRoute<S extends z.ZodTypeAny>(
  req: Request,
  roles: readonly Role[],
  schema: S,
  handler: (input: z.infer<S>, session: Session) => Promise<unknown>,
): Promise<NextResponse> {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!roles.includes(session.role)) return NextResponse.json({ error: "You don't have access to that." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid request.", field: first?.path.join(".") }, { status: 400 });
  }
  try {
    return NextResponse.json(await handler(parsed.data, session));
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("api route failed", error);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}

export const adminRoute = <S extends z.ZodTypeAny>(req: Request, schema: S, handler: (input: z.infer<S>, session: Session) => Promise<unknown>) =>
  apiRoute(req, ["admin"], schema, handler);

export const anyRoleRoute = <S extends z.ZodTypeAny>(req: Request, schema: S, handler: (input: z.infer<S>, session: Session) => Promise<unknown>) =>
  apiRoute(req, ["admin", "employee"], schema, handler);

export const employeeRoute = <S extends z.ZodTypeAny>(req: Request, schema: S, handler: (input: z.infer<S>, session: Session) => Promise<unknown>) =>
  apiRoute(req, ["employee"], schema, handler);
