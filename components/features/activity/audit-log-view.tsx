"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ScrollText, Search } from "lucide-react";
import { Timestamp, documentId, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessChip } from "@/components/features/badges";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { kindOf } from "@/components/features/activity/activity-feed";
import { PageHeader } from "@/components/features/page-header";
import { useCollection } from "@/hooks/use-collection";
import { useNow } from "@/hooks/use-now";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { ACTION_GROUPS, NO_FILTERS, auditCsv, auditSentence, dayStartMs, filterAudit, type ActionGroupId, type AuditRow } from "@/lib/domain/audit-log";
import { formatPkt, pktDateString, pktDayBounds } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, WithId } from "@/types/models";

type AuditDoc = Omit<AuditRow, "id" | "createdAtMs"> & { createdAt: Timestamp };

const RANGES = [
  { days: 0, label: "Today" },
  { days: 6, label: "Last 7 days" },
  { days: 29, label: "Last 30 days" },
  { days: 89, label: "Last 90 days" },
] as const;
const PAGE = 300;

export function AuditLogView() {
  const { db } = getFirebase();
  const now = useNow();
  const today = pktDateString(now);
  const [rangeDays, setRangeDays] = useState<number>(6);
  const [size, setSize] = useState(PAGE);
  const [filters, setFilters] = useState(NO_FILTERS);

  const since = useMemo(() => Timestamp.fromMillis(dayStartMs(pktDayBounds(today).start.getTime(), rangeDays)), [today, rangeDays]);
  const logQ = useMemo(() => query(orgCollection(db, "auditLogs"), where("createdAt", ">=", since), orderBy("createdAt", "desc"), limit(size)), [db, since, size]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const log = useCollection<AuditDoc>(logQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const loaded = useMemo<AuditRow[]>(() => (log.data ?? []).map(({ createdAt, ...r }) => ({ ...r, createdAtMs: createdAt?.toMillis() ?? 0 })), [log.data]);

  // Entries written before titles were recorded get their task's name looked up (null once the task is gone).
  const [found, setFound] = useState<Record<string, string | null>>({});
  const untitled = useMemo(
    () => [...new Set(loaded.filter((r) => !r.meta.title && !r.meta.taskTitle && r.action !== "task.generate" && r.entityId && !(r.entityId in found)).map((r) => `${r.entityType}:${r.entityId}`))],
    [loaded, found],
  );
  useEffect(() => {
    if (untitled.length === 0) return;
    let live = true;
    (async () => {
      const next: Record<string, string | null> = {};
      for (const kind of ["task", "template"] as const) {
        const ids = untitled.filter((u) => u.startsWith(`${kind}:`)).map((u) => u.slice(kind.length + 1));
        for (let i = 0; i < ids.length; i += 30) {
          const chunk = ids.slice(i, i + 30);
          const snap = await getDocs(query(orgCollection(db, kind === "task" ? "tasks" : "taskTemplates"), where(documentId(), "in", chunk))).catch(() => null);
          for (const id of chunk) next[id] = null;
          snap?.docs.forEach((d) => (next[d.id] = String(d.get("title") ?? "") || null));
        }
      }
      if (live) setFound((f) => ({ ...f, ...next }));
    })();
    return () => {
      live = false;
    };
  }, [untitled, db]);
  const rows = useMemo<AuditRow[]>(() => loaded.map((r) => (r.meta.title || r.meta.taskTitle || !found[r.entityId] ? r : { ...r, meta: { ...r.meta, taskTitle: found[r.entityId] } })), [loaded, found]);
  const visible = useMemo(() => filterAudit(rows, filters), [rows, filters]);
  const people = useMemo(() => [...new Map(rows.map((r) => [r.actorId, r.actorName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const bById = useMemo(() => new Map<string, WithId<BusinessDoc>>((businesses.data ?? []).map((b) => [b.id, b])), [businesses.data]);

  const set = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const maybeMore = (log.data?.length ?? 0) >= size;

  function exportCsv() {
    const csv = auditCsv(visible, (ms) => formatPkt(new Date(ms), "yyyy-MM-dd HH:mm:ss"), (id) => bById.get(id)?.name ?? "");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `traxio-audit-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visible.length} ${visible.length === 1 ? "entry" : "entries"}.`);
  }

  const error = log.error ?? businesses.error;
  const loading = log.loading || businesses.loading;

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="A permanent record of every task change: who, what and when. It can't be edited or deleted."
        actions={
          <Button variant="secondary" disabled={visible.length === 0} onClick={exportCsv}>
            <Download aria-hidden /> Export CSV
          </Button>
        }
      />

      <GlassCard className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search the log" type="search" placeholder="Search…" className="pl-9" value={filters.search} onChange={(e) => set("search", e.target.value)} />
        </div>
        <Select aria-label="Time range" value={rangeDays} onChange={(e) => { setRangeDays(Number(e.target.value)); setSize(PAGE); }}>
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by business" value={filters.businessId} onChange={(e) => set("businessId", e.target.value)}>
          <option value="">All businesses</option>
          {(businesses.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by person" value={filters.actorId} onChange={(e) => set("actorId", e.target.value)}>
          <option value="">Everyone</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by kind of change" value={filters.group} onChange={(e) => set("group", e.target.value as ActionGroupId | "")}>
          <option value="">All changes</option>
          {ACTION_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </GlassCard>

      {error ? (
        <ErrorState onRetry={() => { log.retry(); businesses.retry(); }} />
      ) : loading ? (
        <div aria-busy aria-label="Loading the audit log" className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-card" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={rows.length === 0 ? "Nothing recorded in this period" : "Nothing matches those filters"}
          description={rows.length === 0 ? "Pick a longer time range, or wait for the team to start moving tasks." : "Try clearing the search or a filter."}
          action={filtered ? <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button> : undefined}
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted" aria-live="polite">
            Showing <span className="num font-semibold text-foreground">{visible.length}</span> of <span className="num">{rows.length}</span> loaded entries
          </p>
          <GlassCard className="overflow-hidden">
            <ul className="divide-y divide-border-solid">
              {visible.map((r) => {
                const business = bById.get(r.businessId);
                const at = new Date(r.createdAtMs);
                const { icon: Icon, cls } = kindOf(r.action);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-raised/60">
                    <div className="num w-[8.5rem] shrink-0 leading-tight">
                      <p className="text-sm font-medium">{formatPkt(at, "EEE d MMM")}</p>
                      <p className="text-xs text-muted">{formatPkt(at, "h:mm:ss a")}</p>
                    </div>
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", cls)}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="text-sm leading-snug">{auditSentence(r)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {r.actorName}
                        {r.actorRole === "system" ? " (automatic)" : ""} · <span className="font-mono">{r.action}</span>
                      </p>
                    </div>
                    {business ? <BusinessChip name={business.name} color={business.color} /> : null}
                  </li>
                );
              })}
            </ul>
          </GlassCard>
          {maybeMore ? (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => setSize((s) => s + PAGE)}>
                Load {PAGE} older entries
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
