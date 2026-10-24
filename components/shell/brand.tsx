import { cn } from "@/lib/utils";

/** The Traxio mark: a rounded tile holding an "x" with a tracked-item dot, so it reads as "crossed off". Colours come from the logo tokens. */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="var(--logo-tile)" />
      <path d="M12.5 12.5 27.5 27.5" stroke="var(--logo-glyph)" strokeWidth="4.2" strokeLinecap="round" fill="none" />
      <path d="M27.5 12.5 21.2 18.8" stroke="var(--logo-glyph)" strokeWidth="4.2" strokeLinecap="round" fill="none" />
      <circle cx="14.2" cy="25.8" r="2.5" fill="var(--logo-glyph)" />
    </svg>
  );
}

export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Logomark />
      {compact ? null : (
        <span className="font-brand text-[23px] font-bold lowercase leading-none tracking-[-0.04em]">
          tra<span className="text-[var(--logo-x)]">x</span>io
        </span>
      )}
    </span>
  );
}
