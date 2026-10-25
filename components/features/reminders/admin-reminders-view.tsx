"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, CircleCheck, Clock, Eye, Link2, MessagesSquare, Send } from "lucide-react";
import { limit, orderBy, query, where } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { ReminderSheet } from "@/components/features/reminders/reminder-sheet";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, ReminderDoc, UserDoc } from "@/types/models";

export function AdminRemindersView() {
  const { db } = getFirebase();
  const remindersQ = useMemo(() => query(orgCollection(db, "reminders"), orderBy("createdAt", "desc"), limit(100)), [db]);
  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
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
            const doneCount = r.toUids.filter((uid) => r.doneBy?.[uid]).length;
            const allRead = doneCount === r.toUids.length;
            const open = openId === r.id;
            return (
              <li key={r.id}>
                <GlassCard className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                      <Bell className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                        <p className="min-w-0 flex-1 basis-64 whitespace-pre-line text-[15px] font-medium leading-snug">{r.body}</p>
                        <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", allRead ? "bg-success/12 text-success" : "bg-warning/12 text-warning")}>
                          {allRead ? <CircleCheck className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
                          {doneCount} of {r.toUids.length} done
                        </span>
                      </div>
                      <p className="num mt-1 text-xs text-muted">
                        {formatPkt(r.createdAt.toDate(), "EEE d MMM, h:mm a")} · to {r.toUids.length === 1 ? (r.toNames[r.toUids[0]] ?? "1 person") : `${r.toUids.length} people`} · {readCount} seen
                      </p>
                      {r.taskTitle ? (
                        <p className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-raised px-2 py-1 text-xs font-medium text-muted">
                          <Link2 className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">About: {r.taskTitle}</span>
                        </p>
                      ) : null}
                      <div>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : r.id)}
                          className="mt-3 flex min-h-9 items-center gap-1.5 rounded-control text-sm font-medium text-brand-text hover:underline"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                          {open ? "Hide who has seen it" : "Who has seen it"}
                        </button>
                      </div>
                      {open ? (
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                          {r.toUids.map((uid) => {
                            const seen = r.readBy[uid];
                            const finished = r.doneBy?.[uid];
                            return (
                              <li key={uid} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-border-solid px-3 py-2 text-sm">
                                <Avatar name={r.toNames[uid] ?? "Team member"} size="sm" />
                                <span className="min-w-0 flex-1 basis-24 truncate font-medium">{r.toNames[uid] ?? "Team member"}</span>
                                {r.askedBy?.[uid] ? (
                                  <Link href="/admin/inbox" className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline">
                                    <MessagesSquare className="size-3.5" aria-hidden /> Asked
                                  </Link>
                                ) : null}
                                {finished ? (
                                  <span className="num inline-flex shrink-0 items-center gap-1 text-xs text-success">
                                    <CircleCheck className="size-3.5" aria-hidden /> Completed {formatPkt(finished.toDate(), "d MMM, h:mm a")}
                                  </span>
                                ) : seen ? (
                                  <span className="num inline-flex shrink-0 items-center gap-1 text-xs text-info">
                                    <Eye className="size-3.5" aria-hidden /> On it since {formatPkt(seen.toDate(), "d MMM, h:mm a")}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-xs text-warning">Not seen yet</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </div>
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
