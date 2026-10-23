import { z } from "zod";

/** Largest team one workspace may have. One place to change when plans arrive. */
export const MAX_EMPLOYEES_PER_WORKSPACE = 25;

/** Words that would look official or collide with routes, so nobody can claim them as their workspace code. */
const RESERVED_CODES = new Set(["admin", "api", "app", "www", "traxio", "support", "help", "login", "me", "root", "system", "test", "demo-traxio"]);

/**
 * The short name employees type to sign in ("acme-traders"). It becomes part of their sign-in email, so it must be a
 * valid hostname label: lowercase letters, digits and single dashes inside, 3 to 24 characters.
 */
export const workspaceCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/, "3 to 24 characters: letters, numbers and dashes, starting and ending with a letter or number")
  .refine((c) => !c.includes("--"), "Use single dashes")
  .refine((c) => !RESERVED_CODES.has(c), "That name is reserved. Try another");

export const workspaceNameSchema = z.string().trim().min(2, "Give your workspace a name").max(60, "Keep it under 60 characters");

/** A friendly code suggestion from a name: "Acme Traders Ltd." gives "acme-traders-ltd". */
export function suggestCode(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `${base || "team"}-${"workspace".slice(0, 3)}`.slice(0, 24);
}

/** Candidate codes to try when one is taken: acme, acme-2, acme-3 ... (kept within the length limit). */
export function codeCandidates(base: string, count = 8): string[] {
  const out = [base];
  for (let n = 2; out.length < count; n++) {
    const suffix = `-${n}`;
    out.push(`${base.slice(0, 24 - suffix.length).replace(/-+$/g, "")}${suffix}`);
  }
  return out;
}

export type OrgDoc = { name: string; code: string; ownerUid: string; plan: "free"; createdAt: unknown };
