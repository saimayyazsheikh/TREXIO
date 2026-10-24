"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { deleteDoc, orderBy, query, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { BusinessChip } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { calendarEntrySchema, calendarId, fixedHolidays } from "@/lib/domain/timeoff";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import type { BusinessDoc, CalendarDoc } from "@/types/models";

export function CalendarSettings() {
  const { db } = getFirebase();
  const entriesQ = useMemo(() => query(orgCollection(db, "calendar"), orderBy("date", "asc")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const entries = useCollection<CalendarDoc>(entriesQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const [date, setDate] = useState(pktDateString());
  const [name, setName] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bById = useMemo(() => new Map((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);
  const today = pktDateString();
  const upcoming = (entries.data ?? []).filter((e) => e.date >= today);
  const past = (entries.data ?? []).filter((e) => e.date < today).reverse();

  async function save(input: { date: string; name: string; businessId: string | null }) {
    const parsed = calendarEntrySchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    const { date: d, name: n, businessId: b } = parsed.data;
    await setDoc(orgDocument(db, "calendar", calendarId(d, b)), { date: d, name: n, type: b === null ? "holiday" : "closure", businessId: b });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await save({ date, name, businessId: businessId || null });
      toast.success(businessId ? "Closure added." : "Holiday added.");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addNationalDays() {
    setBusy(true);
    try {
      const year = Number(today.slice(0, 4));
      await Promise.all([...fixedHolidays(year), ...fixedHolidays(year + 1)].filter((h) => h.date >= today).map(save));
      toast.success("National days added. Add Eid and other moon-based holidays by hand.");
    } catch {
      toast.error("Couldn't add the national days. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: CalendarDoc & { id: string }) {
    try {
      await deleteDoc(orgDocument(db, "calendar", e.id));
      toast.success(`${e.name} removed.`);
    } catch {
      toast.error("Couldn't remove that. Try again.");
    }
  }

  const list = (items: (CalendarDoc & { id: string })[]) => (
    <ul className="space-y-2">
      {items.map((e) => {
        const business = e.businessId ? bById.get(e.businessId) : undefined;
        return (
          <li key={e.id}>
            <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span aria-hidden className="num flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-soft leading-none text-brand-text">
                <span className="text-[10px] font-semibold uppercase tracking-wider">{formatPkt(pktInstant(e.date, "12:00"), "MMM")}</span>
                <span className="mt-0.5 font-display text-lg font-semibold">{formatPkt(pktInstant(e.date, "12:00"), "d")}</span>
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-[15px] font-semibold leading-tight">{e.name}</p>
                <p className="num mt-0.5 text-[13px] text-muted">{formatPkt(pktInstant(e.date, "12:00"), "EEEE d MMMM yyyy")}</p>
              </div>
              {business ? <BusinessChip name={business.name} color={business.color} /> : <span className="inline-flex h-6 items-center rounded-full bg-surface-raised px-2.5 text-xs font-semibold text-muted">All businesses</span>}
              <Tooltip label="Remove">
                <Button variant="ghost" size="icon" aria-label={`Remove ${e.name}`} onClick={() => remove(e)}>
                  <Trash2 aria-hidden />
                </Button>
              </Tooltip>
            </GlassCard>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Holidays & closures"
        subtitle="Daily tasks aren't created on these days, and nobody is expected to log hours."
        actions={
          <Button variant="secondary" loading={busy} onClick={addNationalDays}>
            Add national days
          </Button>
        }
      />

      <GlassCard className="mb-6 p-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[10rem_1fr_14rem_auto] sm:items-end" noValidate>
          <Field id="cal-date" label="Date" required>
            {(aria) => <Input {...aria} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field id="cal-name" label="Name" required error={error ?? undefined}>
            {(aria) => <Input {...aria} value={name} maxLength={80} placeholder="For example: Eid ul Fitr" onChange={(e) => setName(e.target.value)} />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cal-scope" className="text-sm font-medium">
              Applies to
            </label>
            <Select id="cal-scope" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">All businesses (holiday)</option>
              {(businesses.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} only (closure)
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" loading={busy}>
            <Plus aria-hidden /> Add
          </Button>
        </form>
      </GlassCard>

      {entries.error ? (
        <ErrorState onRetry={entries.retry} />
      ) : entries.loading ? (
        <div aria-busy aria-label="Loading calendar" className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-card" />
          ))}
        </div>
      ) : (entries.data?.length ?? 0) === 0 ? (
        <EmptyState icon={CalendarDays} title="No holidays yet" description="Add a date above, or tap “Add national days” to start with the fixed ones." />
      ) : (
        <>
          <h2 className="mb-3 font-display text-lg font-semibold">Upcoming</h2>
          {upcoming.length ? list(upcoming) : <p className="text-sm text-muted">Nothing coming up.</p>}
          {past.length ? (
            <>
              <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Past</h2>
              {list(past)}
            </>
          ) : null}
        </>
      )}
    </>
  );
}
