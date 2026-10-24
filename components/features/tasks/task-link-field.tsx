"use client";

import { useMemo, useState } from "react";
import { Check, Link2, Plus, Search, X } from "lucide-react";
import { limit, orderBy, query } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/features/badges";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { cn } from "@/lib/utils";
import type { TaskDoc } from "@/types/models";

/** Chosen tasks as removable chips, plus a searchable picker over recent one-off tasks. */
export function TaskLinkField({
  label,
  hint,
  value,
  onChange,
  titles,
  onTitle,
  excludeId,
  max,
}: {
  label: string;
  hint: string;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Known titles by task id (so chips can show names without reading each task). */
  titles: Record<string, string>;
  onTitle: (id: string, title: string) => void;
  excludeId?: string;
  max: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useMemo(() => (open ? query(orgCollection(getFirebase().db, "tasks"), orderBy("date", "desc"), limit(300)) : null), [open]);
  const tasks = useCollection<TaskDoc>(q);

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => t.kind === "oneoff" && t.id !== excludeId)
      .filter((t) => !term || t.title.toLowerCase().includes(term) || Object.values(t.assigneeNames).some((n) => n.toLowerCase().includes(term)));
  }, [tasks.data, search, excludeId]);

  function toggle(id: string, title: string) {
    if (value.includes(id)) return onChange(value.filter((x) => x !== id));
    if (value.length >= max) return;
    onTitle(id, title);
    onChange([...value, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((id) => (
            <li key={id} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border-solid bg-surface-raised pl-3 pr-1 text-sm">
              <Link2 className="size-3.5 text-muted" aria-hidden />
              <span className="max-w-48 truncate">{titles[id] ?? "Linked task"}</span>
              <button type="button" aria-label={`Remove ${titles[id] ?? "linked task"}`} onClick={() => onChange(value.filter((x) => x !== id))} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-black/10 dark:hover:bg-white/10">
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="secondary" size="sm" className="self-start" disabled={value.length >= max} onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add task
      </Button>
      <p className="text-sm text-muted">{hint}</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Pick from recent one-off tasks. Tap a task to add or remove it.</DialogDescription>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input aria-label="Search tasks" placeholder="Search by title or person" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-3 max-h-80 overflow-y-auto">
            {tasks.loading ? (
              <Skeleton className="h-40 rounded-card" />
            ) : tasks.error ? (
              <p role="alert" className="py-6 text-center text-sm text-danger">
                Couldn&apos;t load tasks. Close this and try again.
              </p>
            ) : candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No matching one-off tasks.</p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((t) => {
                  const on = value.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(t.id, t.title)}
                        className={cn("flex min-h-14 w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors", on ? "border-ring bg-surface-raised" : "border-transparent hover:bg-surface-raised")}
                      >
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-transparent bg-brand text-brand-fg" : "border-input")}>
                          {on ? <Check className="size-3.5" aria-hidden /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{t.title}</span>
                          <span className="num block truncate text-xs text-muted">
                            {t.date} · {Object.values(t.assigneeNames).join(", ") || "Unassigned"}
                          </span>
                        </span>
                        <StatusBadge status={t.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
