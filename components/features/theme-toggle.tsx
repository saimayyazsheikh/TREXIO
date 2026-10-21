"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Tooltip label={`Switch to ${next} mode`}>
      <Button variant="ghost" size="icon" aria-label={`Switch to ${next} mode`} onClick={() => setTheme(next)}>
        <Sun className="hidden dark:block" aria-hidden />
        <Moon className="dark:hidden" aria-hidden />
      </Button>
    </Tooltip>
  );
}
