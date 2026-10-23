"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink, MessageCircleMore } from "lucide-react";
import { collection, query, where } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { briefingText } from "@/lib/domain/automation";
import { waLink } from "@/lib/domain/whatsapp-link";
import { pktDateString } from "@/lib/time";
import type { TaskDoc, UserDoc } from "@/types/models";

/**
 * Today's task list for each person, ready to send on WhatsApp. Nothing is sent by Traxio: the button opens WhatsApp
 * with the chat and the message already filled in, and you press send there.
 */
export function ManualBriefing() {
  const { db } = getFirebase();
  const today = pktDateString();
  const usersQ = useMemo(() => query(collection(db, "users"), where("role", "==", "employee")), [db]);
  const tasksQ = useMemo(() => query(collection(db, "tasks"), where("date", "==", today)), [db, today]);
  const users = useCollection<UserDoc>(usersQ);
  const tasks = useCollection<TaskDoc>(tasksQ);

  const rows = useMemo(
    () =>
      (users.data ?? [])
        .filter((u) => u.status === "active")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => {
          const open = (tasks.data ?? [])
            .filter((t) => t.assigneeIds.includes(u.id) && t.status !== "completed" && !t.completion?.[u.id]?.done)
            .sort((a, b) => (a.dueAt?.toMillis() ?? Infinity) - (b.dueAt?.toMillis() ?? Infinity));
          const text = briefingText(u.name, open.map((t) => ({ title: t.title, dueAtMs: t.dueAt?.toMillis() ?? null })));
          return { user: u, open: open.length, link: waLink(u.phone, text) };
        }),
    [users.data, tasks.data],
  );

  if (users.error || tasks.error) return <ErrorState onRetry={() => { users.retry(); tasks.retry(); }} />;
  if (users.loading || tasks.loading) return <Skeleton aria-busy aria-label="Loading team" className="h-40 rounded-card" />;
  if (rows.length === 0) return <EmptyState icon={MessageCircleMore} title="No team members yet" description="Add people in Team, with their WhatsApp number, and their daily briefing can be sent from here." />;

  return (
    <GlassCard className="divide-y p-0">
      {rows.map(({ user, open, link }) => (
        <div key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate font-medium">{user.name}</p>
            <p className="num text-sm text-muted">{open === 0 ? "Nothing open today" : `${open} open ${open === 1 ? "task" : "tasks"} today`}</p>
          </div>
          {link ? (
            <Button asChild variant="secondary" size="sm">
              <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open WhatsApp with ${user.name}'s briefing`}>
                <MessageCircleMore aria-hidden /> WhatsApp <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/settings/team">No WhatsApp number. Add one</Link>
            </Button>
          )}
        </div>
      ))}
    </GlassCard>
  );
}
