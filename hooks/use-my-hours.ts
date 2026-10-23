"use client";

import { useMemo } from "react";

import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgDocument } from "@/lib/firebase/org";
import { effectiveHours, workSlots } from "@/lib/domain/journal";
import type { BusinessDoc, UserDoc } from "@/types/models";

/** The signed-in employee's working hours (their own, else their business's) as journal slot keys. */
export function useMyHours(uid: string) {
  const { db } = getFirebase();
  const userRef = useMemo(() => orgDocument(db, "users", uid), [db, uid]);
  const user = useDocument<UserDoc>(userRef);
  const businessId = user.data?.businessId ?? null;
  const businessRef = useMemo(() => (businessId ? orgDocument(db, "businesses", businessId) : null), [db, businessId]);
  const business = useDocument<BusinessDoc>(businessRef);

  const ready = !!user.data && (!businessId || !!business.data);
  const expected = useMemo(() => {
    if (!user.data || !business.data) return [];
    const { start, end } = effectiveHours(user.data, business.data);
    return workSlots(start, end);
  }, [user.data, business.data]);

  return {
    expected,
    workDays: business.data?.workDays ?? [1, 2, 3, 4, 5, 6, 7],
    user: user.data ?? null,
    business: business.data ?? null,
    loading: !ready && !user.error && !business.error,
    error: user.error ?? business.error,
    retry: () => {
      user.retry();
      business.retry();
    },
  };
}
