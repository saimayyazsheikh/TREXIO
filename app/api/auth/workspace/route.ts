import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { adminAuth, adminDb } from "@/lib/server/admin";
import { isSameOrigin } from "@/lib/server/api-auth";
import { createWorkspace } from "@/lib/server/workspaces";
import { workspaceDepsFor } from "@/lib/server/workspaces-adapter";

const bodySchema = z.object({ idToken: z.string().min(10), name: z.string().max(100), code: z.string().max(40).optional() });

/**
 * Sign-up: someone who just signed in with Google (and has no workspace yet) names their workspace and becomes its admin.
 * Their identity comes from the verified token, never from the request body.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Give your workspace a name." }, { status: 400 });

  try {
    const auth = adminAuth();
    const decoded = await auth.verifyIdToken(body.data.idToken, true);
    // Only a fresh sign-in may create a workspace.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const result = await createWorkspace(
      workspaceDepsFor(auth, adminDb()),
      { uid: decoded.uid, name: decoded.name ?? "", email: decoded.email ?? null, emailVerified: decoded.email_verified === true, alreadyInWorkspace: typeof decoded.orgId === "string" && decoded.orgId !== "" },
      { name: body.data.name, code: body.data.code },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("workspace sign-up failed", error);
    return NextResponse.json({ error: "Couldn't create your workspace. Please try again." }, { status: 500 });
  }
}
