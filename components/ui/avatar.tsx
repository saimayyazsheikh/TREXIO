"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, initials } from "@/lib/utils";

const SIZES = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm" } as const;

/** Round avatar with initials fallback and an optional ring in the employee's business colour. */
export function Avatar({
  name,
  src,
  size = "md",
  ringColor,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  ringColor?: string;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full", SIZES[size], className)}
      style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-brand-soft font-semibold text-brand-text"
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
