import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Business timezone: PKT (UTC+5, no DST). All "day" boundaries are computed here. */
export const APP_TIMEZONE = "Asia/Karachi";
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the given instant in PKT. */
export function pktDateString(at: Date = new Date()): string {
  return formatInTimeZone(at, APP_TIMEZONE, "yyyy-MM-dd");
}

/** Whole days since the Unix epoch, counted on the PKT calendar. Mirrors the Firestore rule expression. */
export function pktDayIndex(at: Date = new Date()): number {
  return Math.floor((at.getTime() + PKT_OFFSET_MS) / DAY_MS);
}

/** The PKT calendar date (`YYYY-MM-DD`) that corresponds to a PKT day index. */
export function dateStringFromDayIndex(dayIndex: number): string {
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
}

/** Day index for a `YYYY-MM-DD` PKT calendar date. */
export function dayIndexFromDateString(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** UTC instants for 00:00:00.000 (inclusive) and the next midnight (exclusive) of a PKT date. */
export function pktDayBounds(date: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${date}T00:00:00`, APP_TIMEZONE);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Hour of day (0–23) in PKT. */
export function pktHour(at: Date = new Date()): number {
  return Number(formatInTimeZone(at, APP_TIMEZONE, "H"));
}

/** Minute of the hour (0–59) in PKT. */
export function pktMinute(at: Date = new Date()): number {
  return Number(formatInTimeZone(at, APP_TIMEZONE, "m"));
}

/** ISO weekday in PKT, 1 = Monday … 7 = Sunday. */
export function pktIsoWeekday(at: Date = new Date()): number {
  return Number(formatInTimeZone(at, APP_TIMEZONE, "i"));
}

/** Human readable PKT timestamp for UI, e.g. "21 Oct, 2:05 PM". */
export function formatPkt(at: Date, pattern = "d MMM, h:mm a"): string {
  return formatInTimeZone(at, APP_TIMEZONE, pattern);
}
