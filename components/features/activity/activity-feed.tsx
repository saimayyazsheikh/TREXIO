"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRightLeft, ArrowUpRight, CircleCheck, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessChip } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { ACTION_GROUPS, groupOf, timeAgo } from "@/lib/domain/audit-log";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

type ActivityDoc = { actorId: string; actorName: string; businessId: string; type: string; text: string; createdAt: Timestamp };

const FEED_SIZE = 100;

/** The icon and colour that say what kind of change a row is, so the list can be scanned without reading every line. */
export function kindOf(type: string): { icon: LucideIcon; cls: string } {
  if (type === "task.complete") return { icon: CircleCheck, cls: "bg-success/14 text-success" };
  switch (groupOf(type)) {
    case "created":
      return { icon: Plus, cls: "bg-brand-soft text-brand-text" };
    case "status":
      return { icon: ArrowRightLeft, cls: "bg-info/14 text-info" };
    case "edits":
      return { icon: Pencil, cls: "bg-warning/14 text-warning" };
    case "deleted":
      return { icon: Trash2, cls: "bg-danger/14 text-danger" };
    default:
      return { icon: Activity, cls: "bg-surface-raised text-muted" };
  }
}

/** Live "who did what" stream: the last 100 task events, filterable by business, person and kind of change. */
export function ActivityFeed({ businesses, employees, now }: { businesses: WithId<BusinessDoc>[]; employees: WithId<UserDoc>[]; now: Date }) {
  const q = useMemo(() => query(orgCollection(getFirebase().db, "activity"), orderBy("createdAt", "desc"), limit(FEED_SIZE)), []);
  const feed = useCollection<ActivityDoc>(q);
  const [businessId, setBusinessId] = useState("");
  const [actorId, setActorId] = useState("");
  const [group, setGroup] = useState("");

  const bById = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);
  const rows = useMemo(
    () =>
      (feed.data ?? []).filter((e) => (!businessId || e.businessId === businessId) && (!actorId || e.actorId === actorId) && (!group || groupOf(e.type) === group)),
    [feed.data, businessId, actorId, group],
  );

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          Live activity
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
        </h2>
        <Link href="/admin/audit" className="inline-flex items-center gap-1 text-sm font-medium text-brand-text underline-offset-4 hover:underline">
          Open the full audit log <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Select aria-label="Filter by business" className="h-9 text-[13px]" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
          <option value="">All businesses</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by person" className="h-9 text-[13px]" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Everyone</option>
          <option value="system">Traxio (automatic)</option>
          {employees.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by kind of change" className="h-9 text-[13px]" value={group} onChange={(e) => setGroup(e.target.value)}>
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
        <ul aria-live="polite" className="max-h-[28rem] divide-y divide-border-solid overflow-y-auto">
          {rows.map((e) => {
            const at = e.createdAt?.toDate();
            const { icon: Icon, cls } = kindOf(e.type);
            const business = bById.get(e.businessId);
            const byActor = e.actorName && e.text.startsWith(e.actorName);
            return (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", cls)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    {byActor ? (
                      <>
                        <span className="font-semibold">{e.actorName}</span>
                        {e.text.slice(e.actorName.length)}
                      </>
                    ) : (
                      e.text
                    )}
                  </p>
                  {business ? <BusinessChip name={business.name} color={business.color} className="mt-1.5 h-5 px-2 text-[11px]" /> : null}
                </div>
                {at ? (
                  <p className="num shrink-0 pt-0.5 text-xs text-muted" title={formatPkt(at, "EEE d MMM, h:mm a")}>
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
