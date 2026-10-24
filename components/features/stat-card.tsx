"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/features/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-brand-soft text-brand-text",
  success: "bg-success/14 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/14 text-danger",
  info: "bg-info/14 text-info",
} as const;

/** "42" or "67%" or "6.1h" -> the number and whatever follows it, so the figure can count up to it. */
function split(value: React.ReactNode): { n: number; decimals: number; tail: string } | null {
  if (typeof value === "number") return { n: value, decimals: Number.isInteger(value) ? 0 : 1, tail: "" };
  if (typeof value !== "string") return null;
  const m = /^(-?\d+(?:\.(\d+))?)(.*)$/.exec(value);
  return m ? { n: Number(m[1]), decimals: m[2]?.length ?? 0, tail: m[3] } : null;
}

/** The figure counts up from zero when it first appears, and from the old figure when it changes. */
function Figure({ value }: { value: React.ReactNode }) {
  const reduce = useReducedMotion();
  const parts = split(value);
  const target = parts?.n ?? 0;
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (!parts) return;
    if (reduce) {
      setShown(target);
      from.current = target;
      return;
    }
    const controls = animate(from.current, target, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce, parts === null]);

  if (!parts) return <>{value}</>;
  return (
    <>
      {shown.toFixed(parts.decimals)}
      {parts.tail}
    </>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  loading = false,
  alert = false,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  loading?: boolean;
  /** Draws a soft pulse around the icon, for figures that need attention. */
  alert?: boolean;
}) {
  return (
    <GlassCard className="rise-in group flex flex-col gap-3 p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] sm:p-5">
      <div className="flex items-center gap-3">
        <span className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110", TONES[tone], alert && !loading && "ring-pulse")}>
          <Icon className="size-5" strokeWidth={2.1} aria-hidden />
        </span>
        <p className="text-sm font-medium leading-snug text-muted">{label}</p>
      </div>
      <div>
        {loading ? <Skeleton className="h-9 w-16" /> : <p className="num font-display text-3xl font-semibold leading-none tracking-tight">{<Figure value={value} />}</p>}
        {hint ? <p className="mt-1.5 text-xs leading-snug text-muted">{hint}</p> : null}
      </div>
    </GlassCard>
  );
}
