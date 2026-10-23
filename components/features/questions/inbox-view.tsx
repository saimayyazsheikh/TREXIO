"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { limit, orderBy, query } from "firebase/firestore";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { QuestionStatusBadge, QuestionThread } from "@/components/features/questions/question-thread";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { QuestionDoc, QuestionStatus } from "@/types/models";

const FILTERS: { id: QuestionStatus | "all"; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "answered", label: "Answered" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

export function InboxView({ adminUid }: { adminUid: string }) {
  const { db } = getFirebase();
  const q = useMemo(() => query(orgCollection(db, "questions"), orderBy("lastMessageAt", "desc"), limit(200)), [db]);
  const questions = useCollection<QuestionDoc>(q);
  const [filter, setFilter] = useState<QuestionStatus | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => questions.data ?? [], [questions.data]);
  const counts = useMemo(() => ({ open: all.filter((x) => x.status === "open").length, answered: all.filter((x) => x.status === "answered").length, closed: all.filter((x) => x.status === "closed").length, all: all.length }), [all]);
  // Urgent first within the list, then newest activity.
  const shown = all.filter((x) => filter === "all" || x.status === filter).sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.lastMessageAt.toMillis() - a.lastMessageAt.toMillis());
  const open = all.find((x) => x.id === openId) ?? null;

  return (
    <>
      <PageHeader title="Inbox" subtitle="Questions from your team. Reply here, then close them when they're sorted. Quick talk happens in Chat." />
      <div role="tablist" aria-label="Question status" className="glass mb-5 inline-flex flex-wrap gap-1 rounded-control p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("min-h-10 rounded-[10px] px-4 text-sm font-medium transition-colors", filter === f.id ? "bg-brand-gradient text-white" : "text-muted hover:text-foreground")}
          >
            {f.label} <span className="num opacity-80">({counts[f.id]})</span>
          </button>
        ))}
      </div>

      {questions.error ? (
        <ErrorState onRetry={questions.retry} />
      ) : questions.loading ? (
        <div aria-busy aria-label="Loading questions" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === "open" ? "Nothing waiting for you" : "Nothing here"}
          description={filter === "open" ? "When someone on your team asks a question, it lands here with a badge on the menu." : "No questions match this filter."}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setOpenId(x.id)} className="block w-full text-left">
                <GlassCard className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 p-4 transition-colors hover:bg-surface-raised", x.unreadForAdmin && "ring-2 ring-ring")}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-semibold">
                      {x.subject}
                      {x.unreadForAdmin ? <span className="ml-2 rounded-full bg-brand-gradient px-2 py-0.5 text-xs font-semibold text-white">New</span> : null}
                    </p>
                    <p className="num mt-0.5 truncate text-sm text-muted">
                      {x.employeeName}
                      {x.taskTitle ? ` · about ${x.taskTitle}` : ""} · {formatPkt(x.lastMessageAt.toDate(), "d MMM, h:mm a")}
                    </p>
                  </div>
                  {x.urgent ? <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">Urgent</span> : null}
                  <QuestionStatusBadge status={x.status} />
                </GlassCard>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        {open ? (
          <SheetContent title={open.subject} description={`From ${open.employeeName}`}>
            <QuestionThread question={open} viewer={{ uid: adminUid, role: "admin" }} />
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}
