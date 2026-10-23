"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleSlash, ClipboardList, KeyRound, Pencil, Plus, Search, UserCheck, UserX, Users } from "lucide-react";
import { collection, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { BusinessChip } from "@/components/features/badges";
import { ConfirmDialog } from "@/components/features/confirm-dialog";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { EmployeeSheet } from "@/components/features/team/employee-sheet";
import { ResetPasswordDialog } from "@/components/features/team/reset-password-dialog";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { businessColorVar } from "@/lib/domain/business-colors";
import { cn } from "@/lib/utils";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

export function TeamView() {
  const usersQ = useMemo(() => query(collection(getFirebase().db, "users"), where("role", "==", "employee")), []);
  const businessesQ = useMemo(() => query(collection(getFirebase().db, "businesses"), orderBy("createdAt", "asc")), []);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const [search, setSearch] = useState("");
  const [businessFilter, setBusinessFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "disabled">("");
  const [editing, setEditing] = useState<WithId<UserDoc> | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resetting, setResetting] = useState<WithId<UserDoc> | null>(null);
  const [disabling, setDisabling] = useState<WithId<UserDoc> | null>(null);

  const businessById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users.data ?? [])
      .filter((u) => (!businessFilter || u.businessId === businessFilter) && (!statusFilter || u.status === statusFilter))
      .filter((u) => !term || [u.name, u.username ?? "", u.designation].some((s) => s.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users.data, search, businessFilter, statusFilter]);

  function openSheet(employee?: WithId<UserDoc>) {
    setEditing(employee);
    setSheetOpen(true);
  }

  async function setStatus(user: WithId<UserDoc>, status: "active" | "disabled") {
    try {
      await apiFetch(`/api/admin/employees/${user.id}/status`, "POST", { status });
      toast.success(status === "disabled" ? `${user.name} is turned off and signed out` : `${user.name} can sign in again`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
      throw error;
    }
  }

  const loading = users.loading || businesses.loading;
  const error = users.error ?? businesses.error;
  const noBusinesses = !loading && !error && (businesses.data?.length ?? 0) === 0;
  const addButton = (
    <Button onClick={() => openSheet()} disabled={noBusinesses}>
      <Plus aria-hidden /> Add team member
    </Button>
  );

  return (
    <>
      <PageHeader title="Team" subtitle="Everyone who signs in to Traxio, across all your businesses." actions={addButton} />

      {error ? (
        <ErrorState
          onRetry={() => {
            users.retry();
            businesses.retry();
          }}
        />
      ) : loading ? (
        <div aria-busy aria-label="Loading team" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : noBusinesses ? (
        <EmptyState
          icon={Users}
          title="Add a business first"
          description="Every team member belongs to one business. Create your first business, then come back to add people."
          action={
            <Button asChild>
              <Link href="/admin/settings/businesses">Go to Businesses</Link>
            </Button>
          }
        />
      ) : (users.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Users}
          title="Add your first team member"
          description="Give each person a username and password. They can sign in right away and see only their own work."
          action={addButton}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search team" placeholder="Search by name, username or role" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select aria-label="Filter by business" value={businessFilter} onChange={(e) => setBusinessFilter(e.target.value)} className="sm:w-48">
              <option value="">All businesses</option>
              {businesses.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="sm:w-40">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="disabled">Turned off</option>
            </Select>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="No one matches those filters" description="Try a different name, or clear the business and status filters." />
          ) : (
            <ul className="space-y-3">
              {visible.map((u) => {
                const business = u.businessId ? businessById.get(u.businessId) : undefined;
                const off = u.status === "disabled";
                return (
                  <li key={u.id}>
                    <GlassCard accent={business ? businessColorVar(business.color) : undefined} className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 p-4", off && "opacity-80")}>
                      <Avatar name={u.name} ringColor={business ? businessColorVar(business.color) : undefined} />
                      <div className="min-w-0 flex-1 basis-48">
                        <Link href={`/admin/employees/${u.id}`} className="block truncate font-semibold hover:underline">
                          {u.name}
                        </Link>
                        <p className="truncate text-sm text-muted">
                          @{u.username}
                          {u.designation ? ` · ${u.designation}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {business ? <BusinessChip name={business.name} color={business.color} /> : <span className="text-sm text-muted">No business</span>}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            off ? "bg-danger/15 text-danger" : "bg-success/15 text-success",
                          )}
                        >
                          {off ? <CircleSlash className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
                          {off ? "Turned off" : "Active"}
                        </span>
                      </div>
                      <div className="ml-auto flex">
                        <Tooltip label="Tasks and daily routines">
                          <Button asChild variant="ghost" size="icon">
                            <Link href={`/admin/employees/${u.id}`} aria-label={`Open ${u.name}'s work`}>
                              <ClipboardList aria-hidden />
                            </Link>
                          </Button>
                        </Tooltip>
                        <Tooltip label="Edit details">
                          <Button variant="ghost" size="icon" aria-label={`Edit ${u.name}`} onClick={() => openSheet(u)}>
                            <Pencil aria-hidden />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Reset password">
                          <Button variant="ghost" size="icon" aria-label={`Reset password for ${u.name}`} onClick={() => setResetting(u)}>
                            <KeyRound aria-hidden />
                          </Button>
                        </Tooltip>
                        <Tooltip label={off ? "Let them sign in again" : "Turn off sign-in"}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={off ? `Turn ${u.name} back on` : `Turn off ${u.name}`}
                            onClick={() => (off ? setStatus(u, "active").catch(() => undefined) : setDisabling(u))}
                          >
                            {off ? <UserCheck aria-hidden /> : <UserX aria-hidden />}
                          </Button>
                        </Tooltip>
                      </div>
                    </GlassCard>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <EmployeeSheet open={sheetOpen} onOpenChange={setSheetOpen} employee={editing} businesses={businesses.data ?? []} />
      <ResetPasswordDialog employee={resetting} onOpenChange={(o) => !o && setResetting(null)} />
      <ConfirmDialog
        open={!!disabling}
        onOpenChange={(o) => !o && setDisabling(null)}
        title={`Turn off ${disabling?.name ?? "this person"}?`}
        description="They'll be signed out right away and can't sign in until you turn them back on. Their tasks and history are kept, and they won't appear in assignment lists."
        confirmLabel="Turn off"
        onConfirm={() => (disabling ? setStatus(disabling, "disabled") : undefined)}
      />
    </>
  );
}
