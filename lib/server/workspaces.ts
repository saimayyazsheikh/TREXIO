import { codeCandidates, suggestCode, workspaceCodeSchema, workspaceNameSchema } from "@/lib/domain/org";
import { ServiceError } from "@/lib/server/service-error";

export type WorkspaceAuthPort = {
  setCustomUserClaims(uid: string, claims: { role: "admin"; orgId: string }): Promise<void>;
};

export type WorkspaceStorePort = {
  newOrgId(): string;
  /**
   * Creates the workspace, its code reservation, the owner's profile and a one-workspace-per-person marker together, or
   * nothing at all. "code-taken" means someone claimed that code a moment earlier (try the next one); "owner-has-workspace"
   * means this person already made one, even if their login token doesn't show it yet.
   */
  createWorkspace(w: { orgId: string; code: string; name: string; owner: { uid: string; name: string; email: string } }): Promise<"ok" | "code-taken" | "owner-has-workspace">;
};

export type WorkspaceDeps = { auth: WorkspaceAuthPort; store: WorkspaceStorePort };

/** Who is signing up, as proven by their verified Google token. */
export type NewOwner = { uid: string; name: string; email: string | null; emailVerified: boolean; alreadyInWorkspace: boolean };

/**
 * Makes a brand-new private workspace for someone who just signed in with Google, and makes them its admin. They add their
 * businesses and team from there. Without a code of their own, one is derived from the workspace name (acme, acme-2 ...).
 */
export async function createWorkspace(deps: WorkspaceDeps, owner: NewOwner, input: { name: string; code?: string }): Promise<{ orgId: string; code: string }> {
  if (!owner.email || !owner.emailVerified) throw new ServiceError("Sign in with an account whose email is verified, like Google.", 403);
  if (owner.alreadyInWorkspace) throw new ServiceError("You already have a workspace. Sign in to use it.", 409);

  const name = workspaceNameSchema.safeParse(input.name);
  if (!name.success) throw new ServiceError(name.error.issues[0]?.message ?? "Give your workspace a name.", 400);

  let candidates: string[];
  if (input.code?.trim()) {
    const code = workspaceCodeSchema.safeParse(input.code);
    if (!code.success) throw new ServiceError(code.error.issues[0]?.message ?? "That workspace code isn't valid.", 400);
    candidates = [code.data];
  } else {
    candidates = codeCandidates(suggestCode(name.data));
  }

  const orgId = deps.store.newOrgId();
  const profile = { uid: owner.uid, name: owner.name || owner.email.split("@")[0], email: owner.email };
  for (const code of candidates) {
    const outcome = await deps.store.createWorkspace({ orgId, code, name: name.data, owner: profile });
    if (outcome === "owner-has-workspace") throw new ServiceError("You already have a workspace. Sign in to use it.", 409);
    if (outcome === "ok") {
      await deps.auth.setCustomUserClaims(owner.uid, { role: "admin", orgId });
      return { orgId, code };
    }
  }
  throw new ServiceError(input.code?.trim() ? "That workspace code is already taken. Try another." : "Couldn't find a free workspace code. Try giving a code of your own.", 409);
}
