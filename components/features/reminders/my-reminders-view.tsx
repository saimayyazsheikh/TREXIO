"use client";

import { useMemo, useState } from "react";
import { Bell, CheckCheck, Link2 } from "lucide-react";
import { limit, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ReminderDoc } from "@/types/models";

export function MyRemindersView({ uid }: { uid: string }) {
  const { db } = getFirebase();
  const q = useMemo(() => query(orgCollection(db, "reminders"), where("toUids", "array-contains", uid), orderBy("createdAt", "desc"), limit(50)), [db, uid]);
  const reminders = useCollection<ReminderDoc>(q);
  const [busy, setBusy] = useState<string | null>(null);

  const unread = (reminders.data ?? []).filter((r) => !r.readBy[uid]);

  async function markRead(ids: string[]) {
    setBusy(ids.length === 1 ? ids[0] : "all");
    try {
      await Promise.all(ids.map((id) => updateDoc(orgDocument(db, "reminders", id), { [`readBy.${uid}`]: serverTimestamp() })));
    } catch {
      toast.error("Couldn't mark that as read. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reminders"
        subtitle="Nudges from your admin. Tap “Got it” so they know you've seen them."
        actions={
          unread.length > 1 ? (
            <Button variant="secondary" loading={busy === "all"} onClick={() => markRead(unread.map((r) => r.id))}>
              <CheckCheck aria-hidden /> Mark all as read
            </Button>
          ) : undefined
        }
      />
      {reminders.error ? (
        <ErrorState onRetry={reminders.retry} />
      ) : reminders.loading ? (
        <div aria-busy aria-label="Loading reminders" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : (reminders.data?.length ?? 0) === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="When your admin sends you a reminder, it shows up here and a number appears on this tab." />
      ) : (
        <ul className="space-y-3">
          {reminders.data?.map((r) => {
            const read = r.readBy[uid];
            return (
              <li key={r.id}>
                <GlassCard className={cn("p-4", !read && "ring-2 ring-ring")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {r.fromName}
                      {!read ? <span className="ml-2 rounded-full bg-brand-gradient px-2 py-0.5 text-xs font-semibold text-white">New</span> : null}
                    </p>
                    <p className="num text-sm text-muted">{formatPkt(r.createdAt.toDate(), "EEE d MMM, h:mm a")}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-line">{r.body}</p>
                  {r.taskTitle ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
                      <Link2 className="size-4" aria-hidden /> About: {r.taskTitle}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-end">
                    {read ? (
                      <p className="num inline-flex items-center gap-1.5 text-sm text-success">
                        <CheckCheck className="size-4" aria-hidden /> You read this {formatPkt(read.toDate(), "d MMM, h:mm a")}
                      </p>
                    ) : (
                      <Button size="sm" loading={busy === r.id} onClick={() => markRead([r.id])}>
                        Got it
                      </Button>
                    )}
                  </div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
