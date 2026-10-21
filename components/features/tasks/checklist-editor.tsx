"use client";

import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";

export type ChecklistItem = { id?: string; title: string };

/** Editable list of checklist steps. Existing steps keep their `id` so progress survives an edit. */
export function ChecklistEditor({
  items,
  onChange,
  max = 30,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  max?: number;
}) {
  const lastRef = useRef<HTMLInputElement>(null);

  function update(index: number, title: string) {
    onChange(items.map((it, i) => (i === index ? { ...it, title } : it)));
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? <p className="text-sm text-muted">No steps yet. A task with steps can only be finished once every step is ticked.</p> : null}
      {items.map((item, i) => (
        <div key={item.id ?? `new-${i}`} className="flex gap-2">
          <Input
            ref={i === items.length - 1 ? lastRef : undefined}
            aria-label={`Step ${i + 1}`}
            value={item.title}
            maxLength={120}
            placeholder={`Step ${i + 1}`}
            onChange={(e) => update(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (items.length < max) {
                  onChange([...items, { title: "" }]);
                  setTimeout(() => lastRef.current?.focus(), 0);
                }
              }
            }}
          />
          <Tooltip label="Remove step">
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <X aria-hidden />
            </Button>
          </Tooltip>
        </div>
      ))}
      {items.length < max ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => {
            onChange([...items, { title: "" }]);
            setTimeout(() => lastRef.current?.focus(), 0);
          }}
        >
          <Plus aria-hidden /> Add a step
        </Button>
      ) : null}
    </div>
  );
}
