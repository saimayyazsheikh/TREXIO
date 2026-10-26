"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/features/glass-card";

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Check your connection and try again.",
  onRetry,
  detail,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** The technical message, shown folded away so a problem can be reported exactly. */
  detail?: string;
}) {
  return (
    <GlassCard role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-danger/12 text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      {detail ? (
        <details className="mt-3 max-w-md text-xs text-muted">
          <summary className="cursor-pointer">Details</summary>
          <p className="mt-1 break-words">{detail}</p>
        </details>
      ) : null}
      {onRetry ? (
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </GlassCard>
  );
}
