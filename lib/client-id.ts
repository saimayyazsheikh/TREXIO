/** A random alphanumeric id minted in the browser, so sending the same form twice (a double click) is recognised and refused. */
export function newClientId(length = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}
