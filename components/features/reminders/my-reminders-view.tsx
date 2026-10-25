"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, CircleCheck, CircleHelp, Eye, Link2, MessagesSquare } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pill } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ReminderDoc, WithId } from "@/types/models";

type Action = { action: "seen" | "complete" } | { action: "ask"; body: string };
const respond = (reminderId: string, body: Action) => apiFetch<{ questionId?: string }>("/api/reminders", "POST", { reminderId, ...body });

export function MyRemindersView({ uid }: { uid: string }) {
  const { db } = getFirebase();
  const q = useMemo(() => query(orgCollection(db, "reminders"), where("toUids", "array-contains", uid), orderBy("createdAt", "desc"), limit(50)), [db, uid]);
  const reminders = useCollection<ReminderDoc>(q);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<WithId<ReminderDoc> | null>(null);
  const [question, setQuestion] = useState("");

  const all = reminders.data ?? [];
  const isDone = (r: ReminderDoc) => !!r.doneBy?.[uid];
  const fresh = all.filter((r) => !isDone(r) && !r.readBy[uid]);
  const onIt = all.filter((r) => !isDone(r) && !!r.readBy[uid]);
  const done = all.filter(isDone);

  async function run(id: string, action: Action, success: string) {
    setBusy(`${id}:${action.action}`);
    try {
      await respond(id, action);
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sendQuestion() {
    if (!asking) return;
    if (await run(asking.id, { action: "ask", body: question }, "Opened in Ask. Your admin will reply there.")) {
      setAsking(null);
      setQuestion("");
    }
  }

  const card = (r: WithId<ReminderDoc>) => {
    const seen = r.readBy[uid];
    const finished = r.doneBy?.[uid];
    const thread = r.askedBy?.[uid];
    return (
      <li key={r.id}>
        <GlassCard className={cn("p-4", !seen && !finished && "ring-2 ring-ring")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {r.fromName}
              {!seen && !finished ? <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-fg">New</span> : null}
            </p>
            <p className="num text-sm text-muted">{formatPkt(r.createdAt.toDate(), "EEE d MMM, h:mm a")}</p>
          </div>
          <p className="mt-2 whitespace-pre-line">{r.body}</p>
          {r.taskTitle ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
              <Link2 className="size-4" aria-hidden /> About: {r.taskTitle}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-solid pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {finished ? (
                <span className={cn(pill, "bg-success/12 text-success")}>
                  <CircleCheck className="size-3.5" aria-hidden /> Completed {formatPkt(finished.toDate(), "d MMM, h:mm a")}
                </span>
              ) : seen ? (
                <span className={cn(pill, "bg-info/12 text-info")}>
                  <Eye className="size-3.5" aria-hidden /> You&apos;re on it
                </span>
              ) : null}
              {thread ? (
                <Link href="/me/ask" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-text hover:underline">
                  <MessagesSquare className="size-4" aria-hidden /> See the conversation
                </Link>
              ) : null}
            </div>
            {finished ? null : (
              <div className="flex flex-wrap items-center gap-2">
                {seen ? null : (
                  <Button size="sm" variant="secondary" loading={busy === `${r.id}:seen`} onClick={() => void run(r.id, { action: "seen" }, "Got it. Your admin can see you’re on it.")}>
                    <Eye aria-hidden /> Got it
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => { setAsking(r); setQuestion(""); }}>
                  <CircleHelp aria-hidden /> Ask
                </Button>
                <Button size="sm" loading={busy === `${r.id}:complete`} onClick={() => void run(r.id, { action: "complete" }, "Marked as completed.")}>
                  <CheckCheck aria-hidden /> Completed
                </Button>
              </div>
            )}
          </div>
        </GlassCard>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Reminders" subtitle="Nudges from your admin. Tap “Got it” when you start, “Ask” if you need to talk about it, and “Completed” when it is done." />
      {reminders.error ? (
        <ErrorState onRetry={reminders.retry} />
      ) : reminders.loading ? (
        <div aria-busy aria-label="Loading reminders" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="When your admin sends you a reminder, it shows up here and a number appears on this tab." />
      ) : (
        <Tabs defaultValue="todo">
          <TabsList>
            <TabsTrigger value="todo">
              To do <span className="num ml-1 text-xs opacity-70">{fresh.length + onIt.length}</span>
            </TabsTrigger>
            <TabsTrigger value="done">
              Done <span className="num ml-1 text-xs opacity-70">{done.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="todo" className="space-y-6">
            {fresh.length + onIt.length === 0 ? <p className="rounded-card border border-dashed border-border-solid px-4 py-8 text-center text-sm text-muted">Nothing waiting for you. Finished reminders are under Done.</p> : null}
            {fresh.length > 0 ? (
              <section aria-labelledby="rem-new">
                <h2 id="rem-new" className="mb-3 font-display text-lg font-semibold">
                  New
                </h2>
                <ul className="space-y-3">{fresh.map(card)}</ul>
              </section>
            ) : null}
            {onIt.length > 0 ? (
              <section aria-labelledby="rem-on">
                <h2 id="rem-on" className="mb-3 font-display text-lg font-semibold">
                  You&apos;re on it
                </h2>
                <ul className="space-y-3">{onIt.map(card)}</ul>
              </section>
            ) : null}
          </TabsContent>
          <TabsContent value="done">
            {done.length === 0 ? <p className="rounded-card border border-dashed border-border-solid px-4 py-8 text-center text-sm text-muted">Reminders you complete show up here.</p> : <ul className="space-y-3">{done.map(card)}</ul>}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent>
          <DialogTitle>Ask about this reminder</DialogTitle>
          <DialogDescription>It opens a conversation in Ask, so you and your admin can go back and forth. Come back here to complete it when it is sorted.</DialogDescription>
          {asking ? <p className="mt-3 line-clamp-3 border-l-2 border-border-solid pl-3 text-sm text-muted">{asking.body}</p> : null}
          <label htmlFor="reminder-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="reminder-question"
            rows={4}
            maxLength={4000}
            value={question}
            autoFocus
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you need to know?"
            className="mt-4 w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
          />
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button loading={busy?.endsWith(":ask")} disabled={!question.trim()} onClick={sendQuestion}>
              Open in Ask
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
