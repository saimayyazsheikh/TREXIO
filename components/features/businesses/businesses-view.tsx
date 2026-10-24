"use client";

import { useMemo, useState } from "react";
import { Building2, Clock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { deleteDoc, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/features/confirm-dialog";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { BusinessSheet } from "@/components/features/businesses/business-sheet";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { businessColorVar } from "@/lib/domain/business-colors";
import { describeWorkDays } from "@/lib/domain/work-days";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

export function BusinessesView() {
  const q = useMemo(() => query(orgCollection(getFirebase().db, "businesses"), orderBy("createdAt", "asc")), []);
  const employeesQ = useMemo(() => query(orgCollection(getFirebase().db, "users"), where("role", "==", "employee")), []);
  const businesses = useCollection<BusinessDoc>(q);
  const employees = useCollection<UserDoc>(employeesQ);

  const [editing, setEditing] = useState<WithId<BusinessDoc> | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<WithId<BusinessDoc> | null>(null);

  const headcount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees.data ?? []) if (e.businessId) counts.set(e.businessId, (counts.get(e.businessId) ?? 0) + 1);
    return counts;
  }, [employees.data]);

  function openSheet(business?: WithId<BusinessDoc>) {
    setEditing(business);
    setSheetOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteDoc(orgDocument(getFirebase().db, "businesses", deleting.id));
      toast.success(`${deleting.name} deleted`);
    } catch {
      toast.error("Couldn't delete that business. Try again.");
      throw new Error("delete failed");
    }
  }

  const addButton = (
    <Button onClick={() => openSheet()}>
      <Plus aria-hidden /> Add business
    </Button>
  );

  return (
    <>
      <PageHeader title="Businesses" subtitle="Each business has its own team, colour and working hours." actions={addButton} />

      {businesses.error ? (
        <ErrorState onRetry={businesses.retry} />
      ) : businesses.loading ? (
        <div aria-busy aria-label="Loading businesses" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : businesses.data && businesses.data.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Add your first business"
          description="Create each business you run, pick a colour, and set its working hours. Then you can add its team."
          action={addButton}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {businesses.data?.map((b) => {
            const people = headcount.get(b.id) ?? 0;
            return (
              <li key={b.id}>
                <GlassCard className="flex h-full flex-col gap-5 p-5 transition-shadow hover:shadow-[var(--shadow-2)]">
                  <div className="flex items-start gap-3.5">
                    <span
                      aria-hidden
                      className="flex size-12 shrink-0 items-center justify-center rounded-xl font-display text-lg font-semibold"
                      style={{ color: businessColorVar(b.color), backgroundColor: `color-mix(in srgb, ${businessColorVar(b.color)} 14%, transparent)` }}
                    >
                      {b.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-lg font-semibold leading-tight">{b.name}</h2>
                      <p className={cn("mt-1 inline-flex items-center gap-1.5 text-xs font-medium", b.active ? "text-success" : "text-muted")}>
                        <span aria-hidden className={cn("size-1.5 rounded-full", b.active ? "bg-success" : "bg-muted")} />
                        {b.active ? "Active" : "Inactive: no new daily tasks"}
                      </p>
                    </div>
                  </div>
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-muted">
                        <Clock className="size-3.5" aria-hidden />
                      </span>
                      <dt className="sr-only">Working hours</dt>
                      <dd className="num">
                        {b.workStart}–{b.workEnd} · {describeWorkDays(b.workDays)}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-muted">
                        <Users className="size-3.5" aria-hidden />
                      </span>
                      <dt className="sr-only">Team size</dt>
                      <dd className="num">{employees.loading ? "…" : `${people} team member${people === 1 ? "" : "s"}`}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex justify-end gap-1 border-t border-border-solid pt-3">
                    <Tooltip label="Edit business">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${b.name}`} onClick={() => openSheet(b)}>
                        <Pencil aria-hidden />
                      </Button>
                    </Tooltip>
                    <Tooltip label={people > 0 ? `Move or remove its ${people} team member${people === 1 ? "" : "s"} first` : "Delete business"}>
                      {/* aria-disabled (not disabled) keeps the tooltip reachable by keyboard. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${b.name}`}
                        aria-disabled={people > 0}
                        className={people > 0 ? "opacity-50" : undefined}
                        onClick={() => (people > 0 ? toast.info(`Move or remove ${b.name}'s team members before deleting it.`) : setDeleting(b))}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </Tooltip>
                  </div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}

      <BusinessSheet open={sheetOpen} onOpenChange={setSheetOpen} business={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "business"}?`}
        description="This can't be undone. Past tasks and journals that mention it keep their history."
        confirmLabel="Delete business"
        onConfirm={confirmDelete}
      />
    </>
  );
}
