import { cn } from "@/lib/utils";

/** Small unread count on a nav item. Announced to screen readers as a full phrase, not just a number. */
export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cn("num flex min-w-5 items-center justify-center rounded-full bg-danger-solid px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white", className)}>
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count} unread</span>
    </span>
  );
}
