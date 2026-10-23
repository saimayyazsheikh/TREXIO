"use client";

import { useMemo, useState } from "react";
import { CircleHelp, Plus } from "lucide-react";
import { orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { AskQuestionSheet } from "@/components/features/questions/ask-question-sheet";
import { QuestionStatusBadge, QuestionThread } from "@/components/features/questions/question-thread";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { QuestionDoc } from "@/types/models";

export function MyQuestionsView({ uid }: { uid: string }) {
  const { db } = getFirebase();
  const q = useMemo(() => query(orgCollection(db, "questions"), where("employeeId", "==", uid), orderBy("lastMessageAt", "desc")), [db, uid]);
  const questions = useCollection<QuestionDoc>(q);
  const [asking, setAsking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = questions.data?.find((x) => x.id === openId) ?? null;

  const ask = (
    <Button onClick={() => setAsking(true)}>
      <Plus aria-hidden /> Ask a question
    </Button>
  );

  return (
    <>
      <PageHeader title="Ask a question" subtitle="Questions are for help you need an answer to. For a quick word, use Chat." actions={ask} />
      {questions.error ? (
        <ErrorState onRetry={questions.retry} />
      ) : questions.loading ? (
        <div aria-busy aria-label="Loading questions" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : (questions.data?.length ?? 0) === 0 ? (
        <EmptyState icon={CircleHelp} title="No questions yet" description="Stuck on something? Ask your admin here and keep the whole answer in one place, with files if you need them." action={ask} />
      ) : (
        <ul className="space-y-3">
          {questions.data?.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setOpenId(x.id)} className="block w-full text-left">
                <GlassCard className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 p-4 transition-colors hover:bg-surface-raised", x.unreadForEmployee && "ring-2 ring-ring")}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-semibold">
                      {x.subject}
                      {x.unreadForEmployee ? <span className="ml-2 rounded-full bg-brand-gradient px-2 py-0.5 text-xs font-semibold text-white">New answer</span> : null}
                    </p>
                    <p className="num mt-0.5 text-sm text-muted">Last update {formatPkt(x.lastMessageAt.toDate(), "d MMM, h:mm a")}</p>
                  </div>
                  {x.urgent ? <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">Urgent</span> : null}
                  <QuestionStatusBadge status={x.status} />
                </GlassCard>
              </button>
            </li>
          ))}
        </ul>
      )}

      <AskQuestionSheet open={asking} onOpenChange={setAsking} uid={uid} />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        {open ? (
          <SheetContent title={open.subject} description="Your question and the replies, newest at the bottom.">
            <QuestionThread question={open} viewer={{ uid, role: "employee" }} />
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}
