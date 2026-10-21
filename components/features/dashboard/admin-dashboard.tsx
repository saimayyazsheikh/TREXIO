"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlarmClock, Building2, CircleCheck, Eye, OctagonAlert, Sparkles, Users, ListChecks } from "lucide-react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { PageHeader } from "@/components/features/page-header";
import { StatCard } from "@/components/features/stat-card";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { dashboardStats } from "@/lib/domain/dashboard";
import { pktDateString } from "@/lib/time";
import type { BusinessDoc, TaskDoc, UserDoc } from "@/types/models";

const toRow = (t: TaskDoc) => ({ status: t.status, dueAt: t.dueAt?.toDate() ?? null, date: t.date });

export function AdminDashboard({ firstName }: { firstName: string }) {
  const now = useNow();
  const today = pktDateString(now);
  const { db } = getFirebase();

  const businessesQ = useMemo(() => query(collection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const employeesQ = useMemo(() => query(collection(db, "users"), where("role", "==", "employee")), [db]);
  const todayQ = useMemo(() => query(collection(db, "tasks"), where("date", "==", today), limit(600)), [db, today]);
  const carryQ = useMemo(() => query(collection(db, "tasks"), where("kind", "==", "oneoff"), where("date", "<", today), orderBy("date", "desc"), limit(200)), [db, today]);
  const businesses = useCollection<BusinessDoc>(businessesQ);
  const employees = useCollection<UserDoc>(employeesQ);
  const todays = useCollection<TaskDoc>(todayQ);
  const carried = useCollection<TaskDoc>(carryQ);

  const error = businesses.error ?? employees.error ?? todays.error ?? carried.error;
  const loading = businesses.loading || employees.loading || todays.loading || carried.loading;
  const stats = useMemo(() => dashboardStats((todays.data ?? []).map(toRow), (carried.data ?? []).map(toRow), now, today), [todays.data, carried.data, now, today]);
  const noBusinesses = !loading && !error && (businesses.data?.length ?? 0) === 0;
  const noTeam = !loading && !error && !noBusinesses && (employees.data?.length ?? 0) === 0;

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} subtitle="Today across all your businesses, in one place." />
      {error ? (
        <ErrorState onRetry={() => { businesses.retry(); employees.retry(); todays.retry(); carried.retry(); }} />
      ) : noBusinesses || noTeam ? (
        <EmptyState
          icon={Sparkles}
          title={noBusinesses ? "Your workspace is ready" : "Now add your team"}
          description={noBusinesses ? "Start by adding your businesses, then invite their teams. Tasks and live status will appear here as soon as work starts." : "Add the people who work in each business. They sign in with a username and password you choose."}
          action={
            <Button asChild>
              <Link href={noBusinesses ? "/admin/settings/businesses" : "/admin/settings/team"}>
                {noBusinesses ? <Building2 aria-hidden /> : <Users aria-hidden />} {noBusinesses ? "Add businesses" : "Add team members"}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard loading={loading} label="Tasks today" value={stats.total} hint={`${employees.data?.length ?? 0} team members`} icon={ListChecks} tone="brand" />
            <StatCard loading={loading} label="Completed" value={`${stats.completedPct}%`} hint={`${stats.completed} of ${stats.total}`} icon={CircleCheck} tone="success" />
            <StatCard loading={loading} label="Overdue" value={stats.overdue} hint="Including earlier days" icon={AlarmClock} tone={stats.overdue ? "danger" : "info"} />
            <StatCard loading={loading} label="Blocked" value={stats.blocked} hint="Need a decision" icon={OctagonAlert} tone={stats.blocked ? "warning" : "info"} />
            <StatCard loading={loading} label="Waiting for review" value={stats.inReview} hint="Finished, not approved" icon={Eye} tone="info" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/kanban">Open the Kanban board</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin/settings/team">Manage team</Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}
