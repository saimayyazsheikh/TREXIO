import { MAX_DAYS, weekStartOf } from "@/lib/domain/analytics";
import { dateStringFromDayIndex, dayIndexFromDateString } from "@/lib/time";

export type PeriodId = "today" | "week" | "month" | "last7" | "last30" | "custom";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

const back = (date: string, days: number) => dateStringFromDayIndex(dayIndexFromDateString(date) - days);

/** The dates a named period covers, ending today. A custom range is kept in order and capped to the longest period reports handle. */
export function rangeForPeriod(id: PeriodId, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  switch (id) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: weekStartOf(today), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "last7":
      return { from: back(today, 6), to: today };
    case "last30":
      return { from: back(today, 29), to: today };
    default: {
      const a = custom?.from || today;
      const b = custom?.to || today;
      const [from, to] = a <= b ? [a, b] : [b, a];
      const earliest = back(to, MAX_DAYS - 1);
      return { from: from < earliest ? earliest : from, to };
    }
  }
}
