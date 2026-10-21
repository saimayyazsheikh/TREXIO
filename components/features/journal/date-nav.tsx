"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { dateStringFromDayIndex, dayIndexFromDateString } from "@/lib/time";

export const shiftDate = (date: string, days: number) => dateStringFromDayIndex(dayIndexFromDateString(date) + days);

/** Previous day / Today / next day for a PKT date. Can't go past today. */
export function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (date: string) => void }) {
  const isToday = date === today;
  return (
    <div className="flex items-center gap-1">
      <Tooltip label="Previous day">
        <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => onChange(shiftDate(date, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
      </Tooltip>
      <Button variant="secondary" disabled={isToday} onClick={() => onChange(today)}>
        Today
      </Button>
      <Tooltip label={isToday ? "That's today" : "Next day"}>
        <Button variant="secondary" size="icon" aria-label="Next day" disabled={isToday} onClick={() => onChange(shiftDate(date, 1))}>
          <ChevronRight aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );
}
