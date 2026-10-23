"use client";

import { useMemo, useState } from "react";
import { Bell, ChevronDown, CircleCheck, Clock, Link2, Send } from "lucide-react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { ReminderSheet } from "@/components/features/reminders/reminder-sheet";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, ReminderDoc, UserDoc } from "@/types/models";

export function AdminRemindersView() {
  const { db } = getFirebase();
  const remindersQ = useMemo(() => query(collection(db, "reminders"), orderBy("createdAt", "desc"), limit(100)), [db]);
  const usersQ = useMemo(() => query(collection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(collection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const reminders = useCollection<ReminderDoc>(remindersQ);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const error = reminders.error ?? users.error ?? businesses.error;
  const loading = reminders.loading || users.loading || businesses.loading;
  const send = (
    <Button onClick={() => setComposing(true)}>
      <Send aria-hidden /> Send a reminder
    </Button>
  );

  return (
    <>
      <PageHeader title="Reminders" subtitle="Nudge one person, a few, or everyone. You'll see who has read it." actions={send} />
      {error ? (
        <ErrorState onRetry={() => { reminders.retry(); users.retry(); businesses.retry(); }} />
      ) : loading ? (
        <div aria-busy aria-label="Loading reminders" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : (reminders.data?.length ?? 0) === 0 ? (
        <EmptyState icon={Bell} title="No reminders yet" description="Send a quick nudge, like asking for a report or reminding the team about a deadline. It appears on their Reminders page with an unread badge." action={send} />
      ) : (
        <ul className="space-y-3">
          {reminders.data?.map((r) => {
            const readCount = r.toUids.filter((uid) => r.readBy[uid]).length;
            const allRead = readCount === r.toUids.length;
            const open = openId === r.id;
            return (
              <li key={r.id}>
                <GlassCard className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="num text-sm text-muted">{formatPkt(r.createdAt.toDate(), "EEE d MMM, h:mm a")}</p>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", allRead ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                      {allRead ? <CircleCheck className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
                      {readCount} of {r.toUids.length} read
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line">{r.body}</p>
                  {r.taskTitle ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
                      <Link2 className="size-4" aria-hidden /> About: {r.taskTitle}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="mt-3 flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-brand-text hover:bg-surface-raised"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                    {open ? "Hide who read it" : "Who has read it"}
                  </button>
                  {open ? (
                    <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                      {r.toUids.map((uid) => {
                        const at = r.readBy[uid];
                        return (
                          <li key={uid} className="flex items-center justify-between gap-2 rounded-control bg-surface-raised px-3 py-2 text-sm">
                            <span className="truncate font-medium">{r.toNames[uid] ?? "Team member"}</span>
                            {at ? <span className="num shrink-0 text-xs text-success">Read {formatPkt(at.toDate(), "d MMM, h:mm a")}</span> : <span className="shrink-0 text-xs text-warning">Not read yet</span>}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
      <ReminderSheet open={composing} onOpenChange={setComposing} employees={users.data ?? []} businesses={businesses.data ?? []} />
    </>
  );
}
