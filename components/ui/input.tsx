import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-11 w-full rounded-control border border-input bg-surface-solid px-3 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
