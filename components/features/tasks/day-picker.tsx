"use client";

import { WEEKDAYS } from "@/lib/domain/work-days";
import { cn } from "@/lib/utils";

/** Toggle buttons for ISO weekdays (Mon = 1 … Sun = 7). Same look as the business working-days control. */
export function DayPicker({ value, onChange, legend }: { value: number[]; onChange: (days: number[]) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((d) => {
          const on = value.includes(d.n);
          return (
            <button
              key={d.n}
              type="button"
              aria-pressed={on}
              aria-label={d.long}
              onClick={() => onChange(on ? value.filter((x) => x !== d.n) : [...value, d.n])}
              className={cn(
                "min-h-11 min-w-12 rounded-control border px-3 text-sm font-medium transition-colors",
                on ? "border-transparent bg-brand-gradient text-white" : "border-input hover:bg-surface-raised",
              )}
            >
              {d.short}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
