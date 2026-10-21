"use client";

import { ErrorState } from "@/components/features/error-state";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <div className="w-full">
        <ErrorState onRetry={reset} />
      </div>
    </div>
  );
}
