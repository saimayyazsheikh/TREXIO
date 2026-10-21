/** Calls an admin API route and throws an Error carrying the server's friendly message. */
export async function apiFetch<T = unknown>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the server. Check your internet connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}
