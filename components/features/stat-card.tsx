import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/features/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "from-indigo-600 to-violet-600",
  success: "from-emerald-700 to-teal-600",
  warning: "from-amber-700 to-orange-600",
  danger: "from-rose-700 to-pink-600",
  info: "from-sky-700 to-cyan-600",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  loading = false,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  loading?: boolean;
}) {
  return (
    <GlassCard className="flex items-center gap-4 p-4">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-[var(--shadow-1)]", TONES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {loading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="num font-display text-2xl font-bold leading-tight">{value}</p>}
        {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
      </div>
    </GlassCard>
  );
}
