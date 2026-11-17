import { dateStringFromDayIndex, dayIndexFromDateString, isoWeekdayOfDate } from "@/lib/time";

/** First day of the month a date is in ("2026-11-18" gives "2026-11-01"). */
export const monthStart = (date: string) => `${date.slice(0, 8)}01`;

/** The first day of the month `n` months after (or before, if negative) the month of `month`. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** First and last day of the month, as PKT date strings. */
export function monthRange(month: string): { from: string; to: string } {
  const from = monthStart(month);
  return { from, to: dateStringFromDayIndex(dayIndexFromDateString(addMonths(from, 1)) - 1) };
}

export type GridDay = { date: string; inMonth: boolean };

/** The weeks of a month, Monday first, padded with days of the neighbouring months so every row has seven days. */
export function monthGrid(month: string): GridDay[][] {
  const first = monthStart(month);
  const { to } = monthRange(first);
  const lead = isoWeekdayOfDate(first) - 1;
  const start = dayIndexFromDateString(first) - lead;
  const total = lead + (dayIndexFromDateString(to) - dayIndexFromDateString(first) + 1);
  const weeks = Math.ceil(total / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = dateStringFromDayIndex(start + w * 7 + d);
      return { date, inMonth: date >= first && date <= to };
    }),
  );
}
