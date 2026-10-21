import { describe, expect, it } from "vitest";
import { taskFromFirestore, templateFromFirestore } from "@/lib/server/task-mapper";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("taskFromFirestore", () => {
  it("turns every Timestamp into a Date and keeps nulls", () => {
    const task = taskFromFirestore({
      title: "x", status: "todo", dueAt: ts("2026-10-21T10:00:00Z"), createdAt: ts("2026-10-20T00:00:00Z"), updatedAt: ts("2026-10-20T01:00:00Z"), completedAt: null,
      completion: { ali: { done: true, at: ts("2026-10-21T11:00:00Z") }, sara: { done: false, at: null } },
      subtasks: [{ id: "a", title: "A", done: true, doneAt: ts("2026-10-21T09:00:00Z"), doneBy: "ali" }, { id: "b", title: "B", done: false, doneAt: null, doneBy: null }],
      escalation: { l1At: ts("2026-10-21T12:00:00Z"), l2At: null },
    });
    expect(task.dueAt?.toISOString()).toBe("2026-10-21T10:00:00.000Z");
    expect(task.completedAt).toBeNull();
    expect(task.completion.ali.at).toBeInstanceOf(Date);
    expect(task.completion.sara.at).toBeNull();
    expect(task.subtasks[0].doneAt).toBeInstanceOf(Date);
    expect(task.subtasks[1].doneAt).toBeNull();
    expect(task.escalation.l1At).toBeInstanceOf(Date);
    expect(task.escalation.l2At).toBeNull();
  });
  it("tolerates missing optional structures", () => {
    const task = taskFromFirestore({ createdAt: ts("2026-10-20T00:00:00Z"), updatedAt: ts("2026-10-20T00:00:00Z") });
    expect(task.completion).toEqual({});
    expect(task.subtasks).toEqual([]);
    expect(task.escalation).toEqual({ l1At: null, l2At: null });
  });
});

describe("templateFromFirestore", () => {
  it("converts updatedAt", () => {
    expect(templateFromFirestore({ title: "t", updatedAt: ts("2026-10-20T00:00:00Z") }).updatedAt).toBeInstanceOf(Date);
  });
});
