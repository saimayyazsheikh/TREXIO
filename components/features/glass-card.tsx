import { cn } from "@/lib/utils";

/** Frosted-glass surface used for cards, sidebars and panels. `accent` draws the business-colour left border. */
export function GlassCard({
  className,
  accent,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { accent?: string }) {
  return (
    <div
      className={cn("glass rounded-card", accent && "border-l-4", className)}
      style={accent ? { ...style, borderLeftColor: accent } : style}
      {...props}
    />
  );
}
