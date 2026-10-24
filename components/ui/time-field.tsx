"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STEP = 5;

type Parts = { hour: number; minute: number; pm: boolean };

/** "14:05" -> 2:05 PM. Anything that isn't a valid 24-hour time is "no time chosen". */
function parse(value: string): Parts | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: Number(m[2]), pm: h >= 12 };
}

/** 2:05 PM -> "14:05", the format the forms and the database already use. */
function toValue({ hour, minute, pm }: Parts): string {
  const h = (hour % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime(value: string): string {
  const p = parse(value);
  return p ? `${p.hour}:${String(p.minute).padStart(2, "0")} ${p.pm ? "PM" : "AM"}` : "";
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * A time chooser in the look of the rest of the app: hours, minutes and AM/PM in three columns.
 * It takes and gives "HH:mm" (24-hour) text, exactly like the native time input it replaces.
 */
export const TimeField = React.forwardRef<HTMLButtonElement, Props>(function TimeField(
  { value, onChange, onBlur, id, disabled, placeholder = "Select a time", className, ...aria },
  ref,
) {
  const [open, setOpen] = React.useState(false);
  const [above, setAbove] = React.useState(false);
  const [toRight, setToRight] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const panelId = React.useId();
  const parts = parse(value);
  const shown = parts ?? { hour: 9, minute: 0, pm: false };
  const minutes = React.useMemo(() => {
    const list = Array.from({ length: 60 / STEP }, (_, i) => i * STEP);
    return parts && !list.includes(parts.minute) ? [...list, parts.minute].sort((a, b) => a - b) : list;
  }, [parts]);

  const setRefs = (node: HTMLButtonElement | null) => {
    trigger.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  // Open upwards, or line up with the right edge, when there is no room (the panel sits inside drawers that can't spill over).
  React.useEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setAbove(window.innerHeight - rect.bottom < 330 && rect.top > 330);
    const edge = trigger.current.closest("[role=dialog]")?.getBoundingClientRect().right ?? window.innerWidth;
    setToRight(rect.left + 256 > edge - 12);
  }, [open]);

  // Start each column on the chosen value.
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      box.current?.querySelectorAll<HTMLElement>("[data-column]").forEach((col) => {
        const on = col.querySelector<HTMLElement>("[aria-pressed='true']");
        if (on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.clientHeight / 2;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    onBlur?.();
    if (refocus) trigger.current?.focus();
  }

  const pick = (next: Partial<Parts>) => onChange(toValue({ ...shown, ...next }));

  const cell = (on: boolean) =>
    cn(
      "flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors",
      on ? "bg-brand text-brand-fg" : "text-foreground hover:bg-surface-raised",
    );

  return (
    <div
      ref={box}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={setRefs}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={aria["aria-describedby"]}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-control border border-input bg-surface-solid px-3 text-left text-base transition-colors hover:border-ring/60 focus-visible:border-ring disabled:opacity-50 md:text-sm",
          open && "border-ring",
          aria["aria-invalid"] && "border-danger",
          className,
        )}
      >
        <span className={cn("num", !parts && "text-muted")}>{parts ? formatTime(value) : placeholder}</span>
        <Clock className="size-4 shrink-0 text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose a time"
          className={cn("absolute z-40 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border-solid bg-surface-solid p-2 shadow-[var(--shadow-3)]", toRight ? "right-0" : "left-0", above ? "bottom-full mb-1.5" : "top-full mt-1.5")}
        >
          <div className="grid grid-cols-3 gap-1">
            <p className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">Hour</p>
            <p className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">Minute</p>
            <p className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">AM / PM</p>

            <div data-column className="relative flex h-48 flex-col gap-0.5 overflow-y-auto pr-0.5">
              {HOURS.map((h) => (
                <button key={h} type="button" aria-pressed={parts?.hour === h} aria-label={`${h} o'clock`} className={cell(parts?.hour === h)} onClick={() => pick({ hour: h })}>
                  {h}
                </button>
              ))}
            </div>
            <div data-column className="relative flex h-48 flex-col gap-0.5 overflow-y-auto pr-0.5">
              {minutes.map((m) => (
                <button key={m} type="button" aria-pressed={parts?.minute === m} aria-label={`${m} minutes`} className={cell(parts?.minute === m)} onClick={() => pick({ minute: m })}>
                  {String(m).padStart(2, "0")}
                </button>
              ))}
            </div>
            <div data-column className="flex flex-col gap-0.5">
              {[false, true].map((pm) => (
                <button key={String(pm)} type="button" aria-pressed={parts?.pm === pm} className={cell(parts?.pm === pm)} onClick={() => pick({ pm })}>
                  {pm ? "PM" : "AM"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-solid pt-2">
            <Button type="button" variant="ghost" size="sm" disabled={!parts} onClick={() => { onChange(""); close(true); }}>
              Clear
            </Button>
            <Button type="button" size="sm" onClick={() => { if (!parts) onChange(toValue(shown)); close(true); }}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
