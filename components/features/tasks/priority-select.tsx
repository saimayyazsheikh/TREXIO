"use client";

import { Flame, Minus, ArrowDown, type LucideIcon } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const ICON: Record<Priority, LucideIcon> = { high: Flame, medium: Minus, low: ArrowDown };
const TONE: Record<Priority, string> = { high: "text-priority-high", medium: "text-priority-medium", low: "text-priority-low" };

/** Segmented High / Medium / Low control (radio group; icon + label, never colour alone). */
export function PrioritySelect({ value, onChange, labelledBy }: { value: Priority; onChange: (p: Priority) => void; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-2">
      {PRIORITIES.map((p) => {
        const Icon = ICON[p];
        const selected = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-control border text-sm font-medium transition-colors",
              selected ? "border-ring bg-surface-raised" : "border-input hover:bg-surface-raised",
            )}
          >
            <Icon className={cn("size-4", TONE[p])} aria-hidden />
            {PRIORITY_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}
