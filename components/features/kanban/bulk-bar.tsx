"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/features/confirm-dialog";
import { apiFetch } from "@/lib/api-client";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/domain/constants";
import type { BulkChange, BulkResult } from "@/lib/domain/bulk";
import { pktDateString } from "@/lib/time";
import type { UserDoc, WithId } from "@/types/models";

/** Sits at the bottom of the board while tasks are picked. Each button changes every picked task at once. */
export function BulkBar({ ids, employees, onDone, onCancel }: { ids: string[]; employees: WithId<UserDoc>[]; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(pktDateString());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const n = ids.length;

  async function apply(change: BulkChange, what: string) {
    setBusy(true);
    try {
      const result = await apiFetch<BulkResult>("/api/admin/tasks/bulk", "POST", { taskIds: ids, change });
      if (result.failed.length === 0) toast.success(`${what}: ${result.done} ${result.done === 1 ? "task" : "tasks"}`);
      else {
        const first = result.failed[0];
        toast.warning(`${what}: ${result.done} done, ${result.failed.length} not changed`, { description: `“${first.title}”: ${first.message}${result.failed.length > 1 ? ` (and ${result.failed.length - 1} more)` : ""}`, duration: 9000 });
      }
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change those tasks.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label="Change the selected tasks" className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-solid bg-surface-solid p-3 shadow-[var(--shadow-3)] md:bottom-6">
      <p className="num min-w-24 text-sm font-semibold">{n} selected</p>

      <Select aria-label="Set priority" value="" disabled={busy || n === 0} onChange={(e) => e.target.value && void apply({ kind: "priority", priority: e.target.value as Priority }, "Priority set")} className="w-36">
        <option value="">Priority…</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </Select>

      <Select aria-label="Give to" value="" disabled={busy || n === 0} onChange={(e) => e.target.value && void apply({ kind: "assign", assigneeIds: [e.target.value] }, "Given to " + (employees.find((u) => u.id === e.target.value)?.name ?? "them"))} className="w-40">
        <option value="">Give to…</option>
        {employees
          .filter((u) => u.status === "active")
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </Select>

      <div className="flex items-center gap-2">
        <Input aria-label="Move to day" type="date" min={pktDateString()} value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Button variant="secondary" disabled={busy || n === 0 || !date} onClick={() => void apply({ kind: "date", date }, "Moved")}>
          Move
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" className="text-danger" disabled={busy || n === 0} onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden /> Delete
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <X aria-hidden /> Done
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${n} ${n === 1 ? "task" : "tasks"}?`}
        description="This can't be undone. Anything waiting on them stops waiting."
        confirmLabel="Delete"
        onConfirm={() => apply({ kind: "delete" }, "Deleted")}
      />
    </div>
  );
}
