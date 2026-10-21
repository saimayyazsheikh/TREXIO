import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/features/glass-card";

/** Explains what a page is for and offers the primary action (docs/06 rule 3). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <GlassCard className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-[var(--shadow-2)]">
        <Icon className="size-7" aria-hidden />
      </span>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </GlassCard>
  );
}
