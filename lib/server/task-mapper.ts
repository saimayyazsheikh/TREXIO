import type { TaskData } from "@/lib/domain/tasks";
import type { TemplateData } from "@/lib/domain/task-builders";

type Timestampish = { toDate(): Date };
const toDate = (v: unknown): Date | null => (v && typeof (v as Timestampish).toDate === "function" ? (v as Timestampish).toDate() : v instanceof Date ? v : null);
const required = (v: unknown): Date => toDate(v) ?? new Date(0);

/** Converts a raw Firestore task document (Timestamps) into the domain shape (Dates). */
export function taskFromFirestore(raw: Record<string, unknown>): TaskData {
  const data = raw as unknown as TaskData;
  return {
    ...data,
    assigneeNames: data.assigneeNames ?? {},
    linkTitles: data.linkTitles ?? {},
    waitingOnIds: data.waitingOnIds ?? [],
    dependsOnIds: data.dependsOnIds ?? [],
    relatedTaskIds: data.relatedTaskIds ?? [],
    dueAt: toDate(raw.dueAt),
    createdAt: required(raw.createdAt),
    updatedAt: required(raw.updatedAt),
    completedAt: toDate(raw.completedAt),
    completion: Object.fromEntries(
      Object.entries((raw.completion ?? {}) as Record<string, { done: boolean; at: unknown }>).map(([uid, c]) => [uid, { done: c.done, at: toDate(c.at) }]),
    ),
    subtasks: ((raw.subtasks ?? []) as (Record<string, unknown> & { id: string; title: string; done: boolean; doneBy: string | null })[]).map((s) => ({
      id: s.id, title: s.title, done: s.done, doneBy: s.doneBy ?? null, doneAt: toDate(s.doneAt),
    })),
    notes: ((raw.notes ?? []) as (Record<string, unknown> & { id: string; by: string; byName: string; text: string; about: "comment" | "finish" | "step"; subtaskTitle?: string | null })[]).map((n) => ({
      id: n.id, by: n.by, byName: n.byName, text: n.text, about: n.about, subtaskTitle: n.subtaskTitle ?? null, at: required(n.at),
    })),
    missedReason: (raw.missedReason as string | null | undefined) ?? null,
    missedReasonAt: toDate(raw.missedReasonAt),
    escalation: {
      l1At: toDate((raw.escalation as Record<string, unknown> | undefined)?.l1At),
      l2At: toDate((raw.escalation as Record<string, unknown> | undefined)?.l2At),
    },
  };
}

export function templateFromFirestore(raw: Record<string, unknown>): TemplateData {
  return { ...(raw as unknown as TemplateData), updatedAt: required(raw.updatedAt) };
}
