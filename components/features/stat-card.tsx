import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/features/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-brand-soft text-brand-text",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
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
    <GlassCard className="flex items-start justify-between gap-2 p-4 sm:gap-3 sm:p-5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-muted">{label}</p>
        {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="num mt-1 font-display text-2xl font-semibold sm:text-3xl leading-tight tracking-tight">{value}</p>}
        {hint ? <p className="mt-1 truncate text-xs text-muted">{hint}</p> : null}
      </div>
      <span className={cn("hidden size-10 shrink-0 items-center justify-center rounded-xl min-[420px]:flex", TONES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
    </GlassCard>
  );
}
