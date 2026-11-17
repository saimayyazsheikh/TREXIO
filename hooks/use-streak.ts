"use client";

import { useEffect, useMemo, useState } from "react";
import { getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { STREAK_DAYS, computeStreak, type Streak, type StreakTask } from "@/lib/domain/streaks";
import { dateStringFromDayIndex, dayIndexFromDateString } from "@/lib/time";
import type { TaskDoc, WithId } from "@/types/models";

const CACHE_MS = 30 * 60_000;
const key = (uid: string, today: string) => `traxio:streak:${uid}:${today}`;

export const streakTaskOf = (t: TaskDoc, uid: string): StreakTask => ({
  date: t.date,
  status: t.status,
  doneByMe: !!t.completion?.[uid]?.done,
  dueAtMs: t.dueAt?.toMillis() ?? null,
  completedAtMs: t.completedAt?.toMillis() ?? t.completion?.[uid]?.at?.toMillis() ?? null,
});

/**
 * Days in a row with every task finished on time. The earlier days are read once (and kept for half an hour) so this costs a
 * single small read per visit; today's tasks come from the live list, so finishing something moves the number straight away.
 */
export function useStreak(uid: string, today: string, workDays: number[], todayTasks: WithId<TaskDoc>[], nowMs: number): Streak | null {
  const [past, setPast] = useState<StreakTask[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key(uid, today)) ?? "null") as { at: number; tasks: StreakTask[] } | null;
      if (cached && Date.now() - cached.at < CACHE_MS) {
        setPast(cached.tasks);
        return;
      }
    } catch {
      /* no cache: read it */
    }
    const since = dateStringFromDayIndex(dayIndexFromDateString(today) - STREAK_DAYS);
    const col = orgCollection(getFirebase().db, "tasks");
    const read = (kind: "daily" | "oneoff") =>
      getDocs(query(col, where("assigneeIds", "array-contains", uid), where("kind", "==", kind), where("date", ">=", since), where("date", "<", today), orderBy("date", "desc"), limit(400)));
    Promise.all([read("daily"), read("oneoff")])
      .then(([daily, oneoff]) => {
        if (cancelled) return;
        const tasks = [...daily.docs, ...oneoff.docs].map((d) => streakTaskOf(d.data() as TaskDoc, uid));
        setPast(tasks);
        try {
          sessionStorage.setItem(key(uid, today), JSON.stringify({ at: Date.now(), tasks }));
        } catch {
          /* private mode: it just reads again next time */
        }
      })
      .catch(() => !cancelled && setPast([]));
    return () => {
      cancelled = true;
    };
  }, [uid, today]);

  return useMemo(() => {
    if (!past) return null;
    const tasks = [...past, ...todayTasks.map((t) => streakTaskOf(t, uid))];
    return computeStreak({ tasks, today, workDays, nowMs });
    // The clock only matters to the minute here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [past, todayTasks, uid, today, workDays, Math.floor(nowMs / 60_000)]);
}
