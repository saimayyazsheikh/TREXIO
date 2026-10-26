"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/features/error-state";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <div className="w-full">
        <ErrorState onRetry={reset} detail={error.message} />
      </div>
    </div>
  );
}
