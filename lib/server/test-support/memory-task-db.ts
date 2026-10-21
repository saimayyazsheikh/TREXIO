import type { TaskData } from "@/lib/domain/tasks";
import type { TemplateData } from "@/lib/domain/task-builders";
import type { ActivityEntry, AssigneeRecord, AuditEntry, TaskDb } from "@/lib/server/task-store";

export type World = {
  tasks: Map<string, TaskData>;
  templates: Map<string, TemplateData>;
  audits: AuditEntry[];
  activities: ActivityEntry[];
  users: Map<string, AssigneeRecord>;
};

export function newWorld(): World {
  return {
    tasks: new Map(),
    templates: new Map(),
    audits: [],
    activities: [],
    users: new Map<string, AssigneeRecord>([
      ["ali", { name: "Ali Khan", businessId: "b1", role: "employee", status: "active" }],
      ["sara", { name: "Sara", businessId: "b2", role: "employee", status: "active" }],
      ["off", { name: "Off Person", businessId: "b1", role: "employee", status: "disabled" }],
      ["admin1", { name: "Boss", businessId: null, role: "admin", status: "active" }],
    ]),
  };
}

/** In-memory transaction for tests: buffers writes and applies them only if the callback succeeds (like Firestore). */
export function makeDb(world: World, now: Date): TaskDb {
  let seq = 0;
  return {
    now: () => now,
    newId: () => `id${++seq}`,
    async transaction(fn) {
      const writes: (() => void)[] = [];
      const result = await fn({
        getTask: async (id) => world.tasks.get(id) ?? null,
        getTasksLinkingTo: async (taskId) => [...world.tasks].filter(([, t]) => t.dependsOnIds.includes(taskId) || t.relatedTaskIds.includes(taskId)).map(([id, task]) => ({ id, task })),
        getUser: async (uid) => world.users.get(uid) ?? null,
        setTask: (id, data) => writes.push(() => world.tasks.set(id, data)),
        updateTask: (id, patch) => writes.push(() => world.tasks.set(id, { ...world.tasks.get(id)!, ...patch })),
        deleteTask: (id) => writes.push(() => world.tasks.delete(id)),
        getTemplate: async (id) => world.templates.get(id) ?? null,
        setTemplate: (id, data) => writes.push(() => world.templates.set(id, data)),
        updateTemplate: (id, patch) => writes.push(() => world.templates.set(id, { ...world.templates.get(id)!, ...patch })),
        deleteTemplate: (id) => writes.push(() => world.templates.delete(id)),
        addAudit: (e) => writes.push(() => world.audits.push(e)),
        addActivity: (e) => writes.push(() => world.activities.push(e)),
      });
      writes.forEach((w) => w());
      return result;
    },
  };
}
