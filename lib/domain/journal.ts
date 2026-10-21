import { isoWeekdayOfDate, pktDateString, pktHour, pktMinute } from "@/lib/time";

export type Slot = { text: string; taskIds: string[] };
export type Slots = Record<string, Slot | undefined>;

export const MAX_SLOT_TEXT = 2000;
export const MAX_SLOT_TASKS = 20;
/** The prompt appears at this minute of each working hour when the hour is still empty. */
export const PROMPT_MINUTE = 55;
export const SNOOZE_MS = 3 * 60 * 1000;

/** Slot keys are the two-digit PKT hour, "00" to "23". */
export const hourKey = (hour: number) => String(hour).padStart(2, "0");

/** One journal document per employee per PKT day. */
export const journalId = (employeeId: string, date: string) => `${employeeId}_${date}`;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Hour keys covering a working window: 09:00-18:00 gives 09..17; 09:30-17:15 gives 09..17 too. */
export function workSlots(start: string, end: string): string[] {
  const first = Math.floor(toMinutes(start) / 60);
  const last = Math.max(first, Math.ceil(toMinutes(end) / 60) - 1);
  return Array.from({ length: last - first + 1 }, (_, i) => hourKey(first + i));
}

/** An employee's own hours win over their business's. */
export function effectiveHours(employee: { workStart: string | null; workEnd: string | null }, business: { workStart: string; workEnd: string }) {
  return employee.workStart && employee.workEnd ? { start: employee.workStart, end: employee.workEnd } : { start: business.workStart, end: business.workEnd };
}

export function isWorkingDay(workDays: number[], date: string): boolean {
  return workDays.includes(isoWeekdayOfDate(date));
}

const clock = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour % 24 < 12 ? " AM" : " PM"}`;

/** "9 AM to 10 AM" for the slot "09". */
export function slotLabel(key: string): string {
  const hour = Number(key);
  return `${clock(hour)} to ${clock(hour + 1)}`;
}

export function slotFilled(slot: Slot | undefined): boolean {
  return !!slot && (slot.text.trim() !== "" || slot.taskIds.length > 0);
}

/** How many of the expected working-hour slots have something written in them. */
export function fillStats(slots: Slots | undefined, expected: string[]): { filled: number; expected: number; pct: number } {
  const filled = expected.filter((k) => slotFilled(slots?.[k])).length;
  return { filled, expected: expected.length, pct: expected.length ? Math.round((filled / expected.length) * 100) : 0 };
}

/** Returns the slot to prompt about right now, or null. */
export function promptDue(
  now: Date,
  o: { expected: string[]; slots: Slots | undefined; handled: ReadonlySet<string>; snoozedUntilMs: number | null; promptMinute?: number },
): string | null {
  const key = hourKey(pktHour(now));
  if (!o.expected.includes(key)) return null;
  if (pktMinute(now) < (o.promptMinute ?? PROMPT_MINUTE)) return null;
  if (o.handled.has(`${pktDateString(now)}-${key}`)) return null;
  if (slotFilled(o.slots?.[key])) return null;
  if (o.snoozedUntilMs !== null && now.getTime() < o.snoozedUntilMs) return null;
  return key;
}

/** Adds a task to a slot without duplicates; refuses beyond the per-slot cap. */
export function addTaskToSlot(slot: Slot | undefined, taskId: string): Slot {
  const current = slot ?? { text: "", taskIds: [] };
  if (current.taskIds.includes(taskId) || current.taskIds.length >= MAX_SLOT_TASKS) return current;
  return { ...current, taskIds: [...current.taskIds, taskId] };
}

export const removeTaskFromSlot = (slot: Slot, taskId: string): Slot => ({ ...slot, taskIds: slot.taskIds.filter((id) => id !== taskId) });
