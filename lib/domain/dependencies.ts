import { DomainError } from "@/lib/domain/errors";

export const MAX_DEPENDENCIES = 10;
export const MAX_RELATED = 10;
/** Safety valve so a pathological graph can't make one save read thousands of documents. */
const MAX_VISITED = 200;

/**
 * Rejects a dependency set that would make `taskId` (transitively) wait on itself.
 * `loadDeps(id)` returns the ids that task `id` currently depends on.
 *
 * Adding edges taskId -> d creates a cycle exactly when `taskId` is reachable from some d by following
 * existing dependency edges (or when d === taskId).
 */
export async function assertNoDependencyCycle(
  taskId: string,
  newDependsOn: readonly string[],
  loadDeps: (id: string) => Promise<readonly string[]>,
): Promise<void> {
  if (newDependsOn.includes(taskId)) throw new DomainError("A task can't depend on itself.", 400);

  const seen = new Set<string>();
  const stack = [...newDependsOn];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === taskId) throw new DomainError("That would create a loop: those tasks would end up waiting on each other.", 409);
    if (seen.has(id)) continue;
    seen.add(id);
    if (seen.size > MAX_VISITED) throw new DomainError("That dependency chain is too long to check. Simplify it first.", 409);
    stack.push(...(await loadDeps(id)));
  }
}

/** Ids added to and removed from a list, for symmetric link maintenance. */
export function diffIds(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  const b = new Set(before);
  const a = new Set(after);
  return { added: after.filter((id) => !b.has(id)), removed: before.filter((id) => !a.has(id)) };
}
