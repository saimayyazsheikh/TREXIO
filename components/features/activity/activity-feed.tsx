"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { collection, limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { ACTION_GROUPS, groupOf, timeAgo } from "@/lib/domain/audit-log";
import { formatPkt } from "@/lib/time";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

type ActivityDoc = { actorId: string; actorName: string; businessId: string; type: string; text: string; createdAt: Timestamp };

const FEED_SIZE = 100;

/** Live "who did what" stream: the last 100 task events, filterable by business, person and kind of change. */
export function ActivityFeed({ businesses, employees, now }: { businesses: WithId<BusinessDoc>[]; employees: WithId<UserDoc>[]; now: Date }) {
  const q = useMemo(() => query(collection(getFirebase().db, "activity"), orderBy("createdAt", "desc"), limit(FEED_SIZE)), []);
  const feed = useCollection<ActivityDoc>(q);
  const [businessId, setBusinessId] = useState("");
  const [actorId, setActorId] = useState("");
  const [group, setGroup] = useState("");

  const bName = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses]);
  const rows = useMemo(
    () =>
      (feed.data ?? []).filter((e) => (!businessId || e.businessId === businessId) && (!actorId || e.actorId === actorId) && (!group || groupOf(e.type) === group)),
    [feed.data, businessId, actorId, group],
  );

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Live activity</h2>
        <Link href="/admin/audit" className="text-sm font-medium text-brand-text underline-offset-4 hover:underline">
          Open the full audit log
        </Link>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Select aria-label="Filter by business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
          <option value="">All businesses</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by person" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Everyone</option>
          <option value="system">Traxio (automatic)</option>
          {employees.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by kind of change" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All changes</option>
          {ACTION_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </div>

      {feed.error ? (
        <ErrorState onRetry={feed.retry} />
      ) : feed.loading ? (
        <div aria-busy aria-label="Loading activity" className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-control" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={(feed.data?.length ?? 0) === 0 ? "No activity yet" : "Nothing matches those filters"}
          description={(feed.data?.length ?? 0) === 0 ? "As your team moves tasks, you'll see it here as it happens." : "Try a different business, person or kind of change."}
        />
      ) : (
        <ul aria-live="polite" className="max-h-[28rem] divide-y overflow-y-auto">
          {rows.map((e) => {
            const at = e.createdAt?.toDate();
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <p className="min-w-0 flex-1 basis-60 text-sm">
                  {e.text}
                  {bName.get(e.businessId) ? <span className="text-muted"> · {bName.get(e.businessId)}</span> : null}
                </p>
                {at ? (
                  <p className="num text-xs text-muted" title={formatPkt(at, "EEE d MMM, h:mm a")}>
                    {now.getTime() - at.getTime() > 7 * 86_400_000 ? formatPkt(at, "d MMM") : timeAgo(at.getTime(), now.getTime())}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
