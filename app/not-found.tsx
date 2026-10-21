import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/features/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <div className="w-full">
        <EmptyState
          icon={Compass}
          title="We couldn't find that page"
          description="The link may be old or the page may have moved."
          action={
            <Button asChild>
              <Link href="/">Back to Traxio</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
