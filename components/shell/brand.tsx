import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-[var(--shadow-1)]">
        <Sparkles className="size-5" aria-hidden />
      </span>
      {compact ? null : <span className="font-display text-xl font-extrabold tracking-tight">Traxio</span>}
    </span>
  );
}
