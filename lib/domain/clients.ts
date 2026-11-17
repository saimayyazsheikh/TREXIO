export type ClientTask = { client?: string | null; status: string; dueAtMs: number | null; completedAtMs: number | null; businessId?: string };

export type ClientRow = { client: string; assigned: number; done: number; open: number; late: number; donePct: number };

/** Tasks grouped by the client they were for. Tasks with no client are left out. "Late" is finished after its time, or still open and past it. */
export function buildClientRows(tasks: ClientTask[], nowMs: number): ClientRow[] {
  const rows = new Map<string, ClientRow>();
  for (const t of tasks) {
    const client = (t.client ?? "").trim();
    if (!client) continue;
    const key = client.toLowerCase();
    const row = rows.get(key) ?? { client, assigned: 0, done: 0, open: 0, late: 0, donePct: 0 };
    row.assigned++;
    const done = t.status === "completed";
    if (done) row.done++;
    else row.open++;
    if (t.dueAtMs !== null && (done ? t.completedAtMs !== null && t.completedAtMs > t.dueAtMs : t.dueAtMs < nowMs)) row.late++;
    rows.set(key, row);
  }
  return [...rows.values()].map((r) => ({ ...r, donePct: r.assigned ? Math.round((r.done / r.assigned) * 100) : 0 })).sort((a, b) => b.assigned - a.assigned || a.client.localeCompare(b.client));
}

/** The client names already used, for suggestions, with the most-used first. Spelling is matched without regard to case. */
export function knownClients(tasks: { client?: string | null }[]): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const t of tasks) {
    const name = (t.client ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const c = counts.get(key) ?? { name, n: 0 };
    c.n++;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((c) => c.name);
}
