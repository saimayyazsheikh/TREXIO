"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleHelp, Lock, LockOpen, MessageSquareReply, Send } from "lucide-react";
import { orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pill } from "@/components/features/badges";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import type { Role } from "@/lib/domain/constants";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { QuestionDoc, QuestionMessageDoc, QuestionStatus, WithId } from "@/types/models";

const STATUS: Record<QuestionStatus, { label: string; cls: string; icon: typeof CircleHelp }> = {
  open: { label: "Open", cls: "bg-warning/12 text-warning", icon: CircleHelp },
  answered: { label: "Answered", cls: "bg-success/12 text-success", icon: CircleCheck },
  closed: { label: "Closed", cls: "bg-surface-raised text-muted", icon: Lock },
};

export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  const { label, cls, icon: Icon } = STATUS[status];
  return (
    <span className={cn(pill, cls)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** The conversation on one question, with a reply box. Admin and employee share this. */
export function QuestionThread({ question, viewer }: { question: WithId<QuestionDoc>; viewer: { uid: string; role: Role } }) {
  const { db } = getFirebase();
  const isAdmin = viewer.role === "admin";
  const q = useMemo(() => query(orgCollection(db, "questions", question.id, "messages"), orderBy("createdAt", "asc")), [db, question.id]);
  const messages = useCollection<QuestionMessageDoc>(q);

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Opening a thread clears *your* unread flag (once per question).
  const seenFor = useRef<string | null>(null);
  const unread = isAdmin ? question.unreadForAdmin : question.unreadForEmployee;
  useEffect(() => {
    if (unread && seenFor.current !== question.id) {
      seenFor.current = question.id;
      apiFetch("/api/questions", "POST", { action: "seen", questionId: question.id }).catch(() => undefined);
    }
  }, [unread, question.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.data?.length]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError("Write a reply first.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/questions", "POST", { action: "reply", questionId: question.id, body });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "open" | "closed") {
    try {
      await apiFetch("/api/questions", "POST", { action: "status", questionId: question.id, status });
      toast.success(status === "closed" ? "Question closed" : "Question reopened");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const closed = question.status === "closed";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <QuestionStatusBadge status={question.status} />
        {question.urgent ? <span className={cn(pill, "bg-danger/12 text-danger")}>Urgent</span> : null}
        {question.taskTitle ? <span className={cn(pill, "max-w-full bg-surface-raised font-medium text-muted")}><span className="truncate">About: {question.taskTitle}</span></span> : null}
        {question.reminderBody ? <span className={cn(pill, "max-w-full bg-surface-raised font-medium text-muted")}><span className="truncate">Reminder: {question.reminderBody}</span></span> : null}
        {isAdmin ? (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setStatus(closed ? "open" : "closed")}>
            {closed ? <LockOpen aria-hidden /> : <Lock aria-hidden />} {closed ? "Reopen" : "Close question"}
          </Button>
        ) : null}
      </div>

      <div className="flex-1 space-y-3" aria-live="polite">
        {messages.loading ? <Skeleton className="h-24 rounded-card" /> : null}
        {messages.error ? <p className="text-sm text-danger">Couldn&apos;t load the conversation.</p> : null}
        {messages.data?.map((m) => {
          const mine = m.authorId === viewer.uid;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-card px-4 py-2.5", mine ? "bg-brand text-brand-fg" : "bg-surface-raised")}>
                <p className={cn("text-xs font-semibold", mine ? "text-brand-fg/90" : "text-muted")}>
                  {m.authorName}
                  {m.authorRole === "admin" ? " (admin)" : ""} · <span className="num font-normal">{formatPkt(m.createdAt.toDate(), "d MMM, h:mm a")}</span>
                </p>
                {m.body ? <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p> : null}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {closed ? (
        <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-muted">
          This question is closed.{isAdmin ? " Reopen it to reply." : " If you still need help, ask a new question."}
        </p>
      ) : (
        <form onSubmit={reply} className="flex flex-col gap-2 border-t pt-4" noValidate>
          <label htmlFor="reply-body" className="text-sm font-medium">
            {isAdmin ? "Your reply" : "Add a reply"}
          </label>
          <textarea
            id="reply-body"
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={busy} className="self-end">
            {isAdmin ? <MessageSquareReply aria-hidden /> : <Send aria-hidden />} Send reply
          </Button>
        </form>
      )}
    </div>
  );
}
