"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { limit, orderBy, query } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { pill } from "@/components/features/badges";
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
            className={cn("min-h-10 rounded-[10px] px-4 text-sm font-medium transition-colors", filter === f.id ? "bg-brand text-brand-fg" : "text-muted hover:text-foreground")}
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
                <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-raised">
                  <span className="relative shrink-0">
                    <Avatar name={x.employeeName} size="lg" />
                    {x.unreadForAdmin ? <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-brand ring-[3px] ring-surface-solid" /> : null}
                  </span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className={cn("truncate text-[15px] leading-tight", x.unreadForAdmin ? "font-semibold" : "font-medium")}>
                      {x.subject}
                      {x.unreadForAdmin ? <span className={cn(pill, "ml-2 h-5 bg-brand-soft align-middle text-[11px] text-brand-text")}>New</span> : null}
                    </p>
                    <p className="num mt-1 truncate text-[13px] text-muted">
                      {x.employeeName}
                      {x.taskTitle ? ` · about ${x.taskTitle}` : ""} · {formatPkt(x.lastMessageAt.toDate(), "d MMM, h:mm a")}
                    </p>
                  </div>
                  {x.urgent ? <span className={cn(pill, "bg-danger/12 text-danger")}>Urgent</span> : null}
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
