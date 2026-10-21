"use client";

import { Check } from "lucide-react";
import { BUSINESS_COLORS, businessColorVar, type BusinessColorId } from "@/lib/domain/business-colors";
import { cn } from "@/lib/utils";

/** Radio group of the curated swatches; each is labelled so colour is never the only cue. */
export function ColorPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: BusinessColorId;
  onChange: (id: BusinessColorId) => void;
  labelledBy: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-4 gap-2">
      {BUSINESS_COLORS.map((c) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(c.id)}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-control border px-2.5 text-sm font-medium transition-colors",
              selected ? "border-ring bg-surface-raised" : "border-border-solid hover:bg-surface-raised",
            )}
          >
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-white dark:text-slate-900"
              style={{ backgroundColor: businessColorVar(c.id) }}
            >
              {selected ? <Check className="size-3.5" aria-hidden /> : null}
            </span>
            <span className="truncate">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
