"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/features/error-state";

export default function EmployeeError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return <ErrorState onRetry={reset} detail={error.message} />;
}
