"use client";

import { useMemo } from "react";
import { CalendarOff, PartyPopper } from "lucide-react";
import { query, where } from "firebase/firestore";
import { GlassCard } from "@/components/features/glass-card";
import { useCollection } from "@/hooks/use-collection";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { isClosedFor, leaveCoversDate } from "@/lib/domain/timeoff";
import type { CalendarDoc, LeaveRequestDoc, UserDoc } from "@/types/models";

/** Tells an employee when today is a holiday, their business is closed, or they are on approved leave. */
export function DayNotice({ uid, today }: { uid: string; today: string }) {
  const { db } = getFirebase();
  const meRef = useMemo(() => orgDocument(db, "users", uid), [db, uid]);
  const calQ = useMemo(() => query(orgCollection(db, "calendar"), where("date", "==", today)), [db, today]);
  const leaveQ = useMemo(() => query(orgCollection(db, "leaveRequests"), where("employeeId", "==", uid)), [db, uid]);
  const me = useDocument<UserDoc>(meRef);
  const cal = useCollection<CalendarDoc>(calQ);
  const leave = useCollection<LeaveRequestDoc>(leaveQ);

  const businessId = me.data?.businessId ?? null;
  const entry = businessId ? (cal.data ?? []).find((e) => isClosedFor(today, businessId, [e])) : undefined;
  const onLeave = (leave.data ?? []).find((l) => leaveCoversDate(l, today));

  if (onLeave) {
    return (
      <GlassCard className="mb-6 flex items-center gap-3 p-4">
        <CalendarOff className="size-6 shrink-0 text-info" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">You&apos;re on approved leave today.</span> Your daily tasks are paused.
        </p>
      </GlassCard>
    );
  }
  if (entry) {
    return (
      <GlassCard className="mb-6 flex items-center gap-3 p-4">
        <PartyPopper className="size-6 shrink-0 text-info" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">{entry.name}.</span> {entry.type === "holiday" ? "It's a holiday" : "Your business is closed today"}, so no daily tasks were created.
        </p>
      </GlassCard>
    );
  }
  return null;
}
