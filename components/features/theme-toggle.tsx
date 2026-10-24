"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Tooltip } from "@/components/ui/tooltip";

/** A two-position switch: the knob sits under the sun in light mode and under the moon in dark mode. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The saved theme is only known in the browser, so the label waits for the first client render to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const label = mounted ? `Switch to ${next} mode` : "Switch colour theme";
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setTheme(next)}
        className="relative flex h-9 w-[68px] shrink-0 items-center rounded-full border border-border-solid bg-surface-raised p-0.5"
      >
        <span aria-hidden className="absolute left-0.5 top-0.5 size-7 rounded-full bg-surface-solid shadow-[var(--shadow-1)] transition-transform duration-300 ease-[var(--ease-out)] dark:translate-x-[32px]" />
        <span className="relative z-10 flex size-7 items-center justify-center text-foreground dark:text-muted">
          <Sun className="size-4" aria-hidden />
        </span>
        <span className="relative z-10 flex size-7 items-center justify-center text-muted dark:text-foreground">
          <Moon className="size-4" aria-hidden />
        </span>
      </button>
    </Tooltip>
  );
}
