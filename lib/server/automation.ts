import { ESCALATION_LOOKBACK_MS, escalationAdminText, escalationDue, escalationEmployeeText, type AutomationSettings } from "@/lib/domain/automation";
import { isClosedFor, type CalendarEntry } from "@/lib/domain/timeoff";
import type { TaskData } from "@/lib/domain/tasks";
import { isoWeekdayOfDate, pktDateString } from "@/lib/time";
import type { Notice } from "@/lib/server/communication";

type Person = { name: string; status: "active" | "disabled"; businessId: string | null };
type Business = { name: string; active: boolean; workDays: number[] };

export type AutomationDeps = {
  now(): Date;
  loadSettings(): Promise<AutomationSettings>;
  /** Tasks whose due time falls in [fromMs, toMs]. Escalation filters the rest itself. */
  loadDueBetween(fromMs: number, toMs: number): Promise<{ id: string; task: TaskData }[]>;
  /** Tasks belonging to a PKT day. */
  loadTasksOnDate(date: string): Promise<{ id: string; task: TaskData }[]>;
  loadCalendar(date: string): Promise<CalendarEntry[]>;
  loadEmployeesOnLeave(date: string): Promise<ReadonlySet<string>>;
  loadPeople(ids: string[]): Promise<Map<string, Person>>;
  loadActiveEmployees(): Promise<{ id: string; person: Person }[]>;
  loadBusinesses(ids: string[]): Promise<Map<string, Business>>;
  /** Sets the level's flag if it isn't set yet. True only for the one caller that set it (so a level fires once). */
  claimEscalation(taskId: string, level: 1 | 2, at: Date): Promise<boolean>;
  /** True only for the first caller for this key (a briefing goes out once per person per day). */
  claimRun(key: string): Promise<boolean>;
  notify(notice: Notice): Promise<void>;
};

export type EscalationResult = { checked: number; level1: number; level2: number; paused: number };

/**
 * Looks for late tasks and raises each alert once: level 1 tells the assignees, level 2 tells the admin (both in the
 * app, with a browser push when the person turned that on). Holidays, business closures and approved leave pause alerts (they are not "late" then).
 * The flag is set BEFORE sending, so overlapping runs can never alert twice.
 */
export async function runEscalations(deps: AutomationDeps): Promise<EscalationResult> {
  const now = deps.now();
  const nowMs = now.getTime();
  const settings = await deps.loadSettings();
  const result: EscalationResult = { checked: 0, level1: 0, level2: 0, paused: 0 };

  const candidates = await deps.loadDueBetween(nowMs - ESCALATION_LOOKBACK_MS, nowMs - settings.escalationL1Min * 60_000);
  const today = pktDateString(now);
  const [calendar, onLeave] = await Promise.all([deps.loadCalendar(today), deps.loadEmployeesOnLeave(today)]);
  const people = await deps.loadPeople([...new Set(candidates.flatMap((c) => c.task.assigneeIds))]);
  const businesses = await deps.loadBusinesses([...new Set(candidates.map((c) => c.task.businessId))]);

  for (const { id, task } of candidates) {
    const due = escalationDue({ status: task.status, dueAtMs: task.dueAt?.getTime() ?? null, escalation: task.escalation }, nowMs, settings);
    if (!due.l1 && !due.l2) continue;
    result.checked++;

    // Who still owes work on it, ignoring people who are away or turned off.
    const owing = task.assigneeIds.filter((uid) => !task.completion[uid]?.done && people.get(uid)?.status === "active");
    const working = owing.filter((uid) => !onLeave.has(uid));
    if (isClosedFor(today, task.businessId, calendar) || working.length === 0) {
      result.paused++;
      continue;
    }
    const lateMs = nowMs - (task.dueAt as Date).getTime();

    if (due.l1 && (await deps.claimEscalation(id, 1, now))) {
      const text = escalationEmployeeText({ title: task.title, lateMs });
      await Promise.all(working.map((uid) => deps.notify({ toUid: uid, title: text.title, body: text.body, link: "/me" })));
      result.level1++;
    }

    if (due.l2 && (await deps.claimEscalation(id, 2, now))) {
      const names = working.map((uid) => people.get(uid)?.name ?? "someone");
      const business = businesses.get(task.businessId)?.name ?? "";
      const line = escalationAdminText({ employeeNames: names, title: task.title, business, lateMs });
      await deps.notify({ toUid: "admin", title: "A task is badly late", body: line, link: "/admin/kanban" });
      result.level2++;
    }
  }
  return result;
}

export type BriefingResult = { eligible: number; sent: number; skipped: number; failed: number };

/** Tells each active employee what is on for today (a bell notification, and a push if they turned it on), once per person per day. Skips days off. */
export async function runBriefing(deps: AutomationDeps): Promise<BriefingResult> {
  const now = deps.now();
  const today = pktDateString(now);
  const settings = await deps.loadSettings();
  const result: BriefingResult = { eligible: 0, sent: 0, skipped: 0, failed: 0 };
  if (!settings.briefingEnabled) return result;

  const employees = await deps.loadActiveEmployees();
  const businesses = await deps.loadBusinesses([...new Set(employees.flatMap((e) => (e.person.businessId ? [e.person.businessId] : [])))]);
  const [calendar, onLeave, tasks] = await Promise.all([deps.loadCalendar(today), deps.loadEmployeesOnLeave(today), deps.loadTasksOnDate(today)]);
  const weekday = isoWeekdayOfDate(today);

  for (const { id, person } of employees) {
    const business = person.businessId ? businesses.get(person.businessId) : undefined;
    if (!business || !business.active || !business.workDays.includes(weekday) || isClosedFor(today, person.businessId!, calendar) || onLeave.has(id)) {
      result.skipped++;
      continue;
    }
    result.eligible++;
    const mine = tasks
      .filter((t) => t.task.assigneeIds.includes(id) && t.task.status !== "completed" && !t.task.completion[id]?.done)
      .sort((a, b) => (a.task.dueAt?.getTime() ?? Infinity) - (b.task.dueAt?.getTime() ?? Infinity));
    if (!(await deps.claimRun(`briefing_${today}_${id}`))) {
      result.skipped++;
      continue;
    }
    const titles = mine.map((t) => t.task.title);
    const more = titles.length > 3 ? ` and ${titles.length - 3} more` : "";
    try {
      await deps.notify({
        toUid: id,
        title: titles.length ? `Good morning! ${titles.length} ${titles.length === 1 ? "task" : "tasks"} today` : "Good morning! Nothing assigned yet",
        body: titles.length ? `${titles.slice(0, 3).join(", ")}${more}` : "Your admin hasn't given you work for today yet.",
        link: "/me",
      });
      result.sent++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
