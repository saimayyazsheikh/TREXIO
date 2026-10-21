"use client";

import { ErrorState } from "@/components/features/error-state";

export default function EmployeeError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
