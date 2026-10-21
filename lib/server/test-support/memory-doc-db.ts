import type { DocDb } from "@/lib/server/communication";

type Doc = Record<string, unknown>;

/** In-memory documents addressed by path. Transactions buffer writes and apply them only on success, like Firestore. */
export function makeDocDb(docs: Map<string, Doc>, now: Date): DocDb {
  let seq = 0;
  return {
    now: () => now,
    newId: () => `id${String(++seq).padStart(4, "0")}`,
    async transaction(fn) {
      const writes: (() => void)[] = [];
      const result = await fn({
        get: async (path) => docs.get(path) ?? null,
        create: (path, data) => writes.push(() => docs.set(path, data)),
        update: (path, patch) => writes.push(() => docs.set(path, { ...docs.get(path), ...patch })),
        activeEmployees: async () =>
          [...docs].filter(([p, d]) => /^users\/[^/]+$/.test(p) && d.role === "employee" && d.status === "active").map(([p, d]) => ({ id: p.slice(6), name: String(d.name) })),
      });
      writes.forEach((w) => w());
      return result;
    },
  };
}

export function seedDocs(): Map<string, Doc> {
  return new Map<string, Doc>([
    ["users/ali12345", { name: "Ali Khan", role: "employee", status: "active", businessId: "b1" }],
    ["users/sara9999", { name: "Sara Ahmed", role: "employee", status: "active", businessId: "b1" }],
    ["users/off11111", { name: "Off Person", role: "employee", status: "disabled", businessId: "b1" }],
    ["users/admin1", { name: "Boss", role: "admin", status: "active", businessId: null }],
    ["tasks/t1", { title: "Count stock", assigneeIds: ["ali12345"] }],
  ]);
}
