/** Synthetic email domain for username-only employees. Each workspace gets its own sub-domain: ali@acme-traders.traxio.app. */
export const USERNAME_EMAIL_DOMAIN = "traxio.app";

/** The Firebase Auth email behind an employee's username in a workspace. Two workspaces can both have an "ali". */
export const employeeEmail = (username: string, workspaceCode: string): string => `${username.trim().toLowerCase()}@${workspaceCode.trim().toLowerCase()}.${USERNAME_EMAIL_DOMAIN}`;

/**
 * Maps what the person typed on the login form to the Firebase Auth email. A real email address (an owner signing in with a
 * password) is used as is; a bare username needs the workspace code. Null when a username came without one.
 */
export function identifierToEmail(identifier: string, workspaceCode = ""): string | null {
  const value = identifier.trim().toLowerCase();
  if (value.includes("@")) return value;
  if (!value || !workspaceCode.trim()) return null;
  return employeeEmail(value, workspaceCode);
}
