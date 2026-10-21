/** Synthetic email domain for username-only employees (BRD §9). */
export const USERNAME_EMAIL_DOMAIN = "traxio.app";

/** Maps what the user typed on the login form to the Firebase Auth email. */
export function identifierToEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${USERNAME_EMAIL_DOMAIN}`;
}
