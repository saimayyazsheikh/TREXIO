"use client";

import { Input } from "@/components/ui/input";
import { PERIODS, rangeForPeriod, type PeriodId } from "@/lib/domain/periods";
import { cn } from "@/lib/utils";

export type PeriodState = { id: PeriodId; custom: { from: string; to: string } };

/** Today, this week, this month, last 7 or 30 days, or two dates of your own. */
export function PeriodPicker({ value, today, onChange, className }: { value: PeriodState; today: string; onChange: (next: PeriodState) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1 rounded-control border border-border-solid p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value.id === p.id}
            onClick={() => onChange({ id: p.id, custom: p.id === "custom" && value.id !== "custom" ? rangeForPeriod(value.id, today) : value.custom })}
            className={cn("min-h-9 rounded-lg px-3 text-sm font-medium transition-colors", value.id === p.id ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface-raised hover:text-foreground")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.id === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="period-from">
            From
          </label>
          <Input id="period-from" type="date" max={today} value={value.custom.from} onChange={(e) => onChange({ ...value, custom: { ...value.custom, from: e.target.value } })} className="w-40" />
          <span className="text-sm text-muted">to</span>
          <label className="sr-only" htmlFor="period-to">
            To
          </label>
          <Input id="period-to" type="date" max={today} value={value.custom.to} onChange={(e) => onChange({ ...value, custom: { ...value.custom, to: e.target.value } })} className="w-40" />
        </div>
      ) : null}
    </div>
  );
}
