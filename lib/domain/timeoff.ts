import { z } from "zod";
import { BREAK_TYPES } from "@/lib/domain/presence";
import { DomainError } from "@/lib/domain/errors";
import { attachmentSchema } from "@/lib/domain/task-schemas";
import { dateStringFromDayIndex, dayIndexFromDateString } from "@/lib/time";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const hhmm = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 14:30")]).transform((v) => v || null);
const id = z.string().min(1).max(60);

export const MAX_LEAVE_DAYS = 60;
/** Leave may be requested for a day that already started up to a week ago (sick days are often logged afterwards). */
export const MAX_BACKDATE_DAYS = 7;

export const breakActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), type: z.enum(BREAK_TYPES), note: z.string().trim().max(200).default("") }),
  z.object({ action: z.literal("end") }),
]);
export type BreakAction = z.infer<typeof breakActionSchema>;

export const leaveActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(["leave", "excuse"]),
    fromDate: date,
    toDate: date,
    fromTime: hhmm.default(""),
    toTime: hhmm.default(""),
    reason: z.string().trim().min(3, "Give a short reason").max(500, "Keep the reason under 500 characters"),
    attachments: z.array(attachmentSchema).max(5).default([]),
  }),
  z.object({ action: z.literal("cancel"), requestId: id }),
  z.object({ action: z.literal("decide"), requestId: id, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).default("") }),
]);
export type LeaveAction = z.infer<typeof leaveActionSchema>;
export type NewLeave = Extract<LeaveAction, { action: "create" }>;

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveKind = "leave" | "excuse";

export const daysBetween = (from: string, to: string) => dayIndexFromDateString(to) - dayIndexFromDateString(from) + 1;

/** Checks a new request against the rules the form can't express. Throws a friendly DomainError. */
export function assertValidLeave(input: NewLeave, todayPkt: string): void {
  if (input.toDate < input.fromDate) throw new DomainError("The end date can't be before the start date.", 400);
  if (input.fromDate < dateStringFromDayIndex(dayIndexFromDateString(todayPkt) - MAX_BACKDATE_DAYS)) {
    throw new DomainError(`Leave can start at most ${MAX_BACKDATE_DAYS} days ago.`, 400);
  }
  if (input.kind === "leave") {
    if (input.fromTime || input.toTime) throw new DomainError("Leave covers whole days. For a few hours, choose a short excuse.", 400);
    if (daysBetween(input.fromDate, input.toDate) > MAX_LEAVE_DAYS) throw new DomainError(`Leave can be up to ${MAX_LEAVE_DAYS} days long.`, 400);
    return;
  }
  if (input.fromDate !== input.toDate) throw new DomainError("A short excuse is for a single day.", 400);
  if (!input.fromTime || !input.toTime) throw new DomainError("Add the start and end time of your excuse.", 400);
  if (input.toTime <= input.fromTime) throw new DomainError("The excuse must end after it starts.", 400);
}

/** True when an approved whole-day leave covers `date`. Short excuses never pause tasks. */
export function leaveCoversDate(l: { kind: LeaveKind; status: LeaveStatus; fromDate: string; toDate: string }, date: string): boolean {
  return l.kind === "leave" && l.status === "approved" && l.fromDate <= date && date <= l.toDate;
}

/* ---------------- Holiday and closure calendar ---------------- */

/** One entry per date and scope (everyone, or one business), so duplicates are impossible. */
export const calendarId = (date: string, businessId: string | null) => `${date}_${businessId ?? "all"}`;

export const calendarEntrySchema = z.object({
  date,
  name: z.string().trim().min(2, "Give it a name").max(80),
  /** null = a public holiday for every business. */
  businessId: id.nullable(),
});
export type CalendarEntryInput = z.infer<typeof calendarEntrySchema>;

export type CalendarEntry = { date: string; businessId: string | null };

/** Fixed-date national days commonly observed. Islamic holidays depend on moon sighting and are added by hand. */
export const FIXED_NATIONAL_DAYS = [
  { md: "03-23", name: "Pakistan Day" },
  { md: "05-01", name: "Labour Day" },
  { md: "08-14", name: "Independence Day" },
  { md: "12-25", name: "Quaid-e-Azam Day" },
] as const;

export const fixedHolidays = (year: number) => FIXED_NATIONAL_DAYS.map((h) => ({ date: `${year}-${h.md}`, name: h.name, businessId: null as string | null }));

/** Is `businessId` closed on `date` because of a holiday for everyone or a closure for that business? */
export function isClosedFor(date: string, businessId: string, entries: CalendarEntry[]): boolean {
  return entries.some((e) => e.date === date && (e.businessId === null || e.businessId === businessId));
}
