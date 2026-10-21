import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy aria-label="Loading">
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <Skeleton className="h-40 rounded-card" />
    </div>
  );
}
