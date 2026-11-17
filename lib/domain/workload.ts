import type { Priority } from "@/lib/domain/constants";

/** Statuses that still need someone's work (a completed task is never load). */
export const OPEN_STATUSES = ["todo", "in_progress", "blocked", "under_review"] as const;

/** From this many open tasks someone counts as heavily loaded; up to FREE_OPEN they count as free. */
export const HEAVY_OPEN = 8;
export const FREE_OPEN = 2;
/** Overdue tasks pile up quickly, so a few of them make a person heavy even with a short list. */
export const HEAVY_OVERDUE = 3;

export type WorkloadTask = {
  kind: "daily" | "oneoff";
  date: string;
  status: string;
  priority: Priority;
  dueAtMs: number | null;
  assigneeIds: string[];
  doneBy: string[];
};

export type WorkloadPerson = { id: string; name: string; businessId: string | null };

export type LoadLevel = "free" | "normal" | "heavy" | "away";

export type WorkloadRow = {
  id: string;
  name: string;
  businessId: string | null;
  /** Everything still to do now: one-off tasks dated today or earlier, and today's routines. */
  open: number;
  /** Of those, the ones due today. */
  today: number;
  overdue: number;
  blocked: number;
  /** Finished by this person and waiting for the admin's review. */
  inReview: number;
  highPriority: number;
  /** One-off tasks dated for a later day. They are not load yet. */
  upcoming: number;
  load: LoadLevel;
};

/**
 * How much each person has on their plate right now, so the admin can see who is free before handing out the next task.
 * Old daily routines that were never finished are the "Not done" list, not load, so only today's routines count.
 */
export function buildWorkload(i: { people: WorkloadPerson[]; tasks: WorkloadTask[]; today: string; nowMs: number; away: ReadonlySet<string> }): WorkloadRow[] {
  const rows = i.people.map<WorkloadRow>((p) => {
    const row: WorkloadRow = { id: p.id, name: p.name, businessId: p.businessId, open: 0, today: 0, overdue: 0, blocked: 0, inReview: 0, highPriority: 0, upcoming: 0, load: "normal" };
    for (const t of i.tasks) {
      if (!t.assigneeIds.includes(p.id) || t.status === "completed") continue;
      const mine = !t.doneBy.includes(p.id);
      if (t.kind === "oneoff" && t.date > i.today) {
        if (mine) row.upcoming++;
        continue;
      }
      if (t.kind === "daily" && t.date !== i.today) continue;
      if (t.status === "under_review") {
        row.inReview++;
        continue;
      }
      if (!mine) continue;
      row.open++;
      if (t.date === i.today) row.today++;
      if (t.status === "blocked") row.blocked++;
      if (t.priority === "high") row.highPriority++;
      const late = t.dueAtMs !== null ? t.dueAtMs < i.nowMs : t.date < i.today;
      if (late) row.overdue++;
    }
    row.load = i.away.has(p.id) ? "away" : row.open >= HEAVY_OPEN || row.overdue >= HEAVY_OVERDUE ? "heavy" : row.open <= FREE_OPEN ? "free" : "normal";
    return row;
  });
  return rows.sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name));
}

export const LOAD_LABEL: Record<LoadLevel, string> = { free: "Free", normal: "Busy", heavy: "Heavy", away: "Away" };
