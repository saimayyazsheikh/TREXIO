import { describe, expect, it } from "vitest";
import { describeAudit } from "@/lib/domain/audit-text";

const e = (action: string, over: Partial<Parameters<typeof describeAudit>[0]> = {}) => ({ action, actorName: "Ali", from: null, to: null, meta: {}, ...over });

describe("describeAudit", () => {
  it("describes status moves with readable names and any reason", () => {
    expect(describeAudit(e("task.status", { from: "todo", to: "in_progress" }))).toBe("Ali moved it from To-Do to In Progress");
    expect(describeAudit(e("task.status", { from: "in_progress", to: "blocked", meta: { reason: "printer is down" } }))).toBe("Ali moved it from In Progress to Blocked: printer is down");
  });
  it("describes multi-assignee progress and steps", () => {
    expect(describeAudit(e("task.complete", { meta: { progress: "1/3" } }))).toBe("Ali finished their part (1/3)");
    expect(describeAudit(e("task.reopen", { meta: { progress: "0/3" } }))).toBe("Ali took back their part (0/3)");
    expect(describeAudit(e("task.subtask", { to: "true", meta: { title: "Shelf A", progress: "1/2" } }))).toBe("Ali ticked “Shelf A” (1/2)");
    expect(describeAudit(e("task.subtask", { to: "false", meta: { title: "Shelf A", progress: "0/2" } }))).toBe("Ali unticked “Shelf A” (0/2)");
  });
  it("lists only meaningful changed fields for edits", () => {
    expect(describeAudit(e("task.update", { meta: { changed: ["title", "waitingOnIds", "linkTitles", "priority"] } }))).toBe("Ali edited title, priority");
    expect(describeAudit(e("task.update", { meta: { changed: ["waitingOnIds"] } }))).toBe("Ali edited the task");
  });
  it("handles create, delete, refresh and unknown actions", () => {
    expect(describeAudit(e("task.create"))).toBe("Ali created the task");
    expect(describeAudit(e("task.delete"))).toBe("Ali deleted the task");
    expect(describeAudit(e("task.refresh"))).toBe("Refreshed from its daily routine");
    expect(describeAudit(e("something.else"))).toBe("Ali made a change");
  });
});
