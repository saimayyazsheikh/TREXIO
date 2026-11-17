"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/features/glass-card";
import { buildClientRows, type ClientRow, type ClientTask } from "@/lib/domain/clients";
import { toCsv } from "@/lib/domain/csv";
import { formatPkt, pktInstant } from "@/lib/time";

const label = (date: string) => formatPkt(pktInstant(date, "12:00"), "d MMM");

/** How work went for each client in the period: what was given, what is done, what is still open and what ran late. */
export function ClientsReport({ tasks, range, nowMs }: { tasks: ClientTask[]; range: { from: string; to: string }; nowMs: number }) {
  const rows: ClientRow[] = buildClientRows(tasks, nowMs);

  function exportCsv() {
    const csv = toCsv(["Client", "Tasks", "Done", "Open", "Late", "Done %"], rows.map((r) => [r.client, r.assigned, r.done, r.open, r.late, r.donePct]));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? "client" : "clients"}.`);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Clients</h2>
          <p className="text-sm text-muted">
            One-off tasks by the client they were for, {label(range.from)} to {label(range.to)}. Add a client when you assign a task.
          </p>
        </div>
        <Button variant="secondary" disabled={rows.length === 0} onClick={exportCsv} className="print:hidden">
          <Download aria-hidden /> Export CSV
        </Button>
      </div>
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border-solid">
              {["Client", "Tasks", "Done", "Open", "Late", "Done %"].map((c, i) => (
                <th key={c} scope="col" className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted ${i > 0 ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-solid">
            {rows.map((r) => (
              <tr key={r.client}>
                <th scope="row" className="px-3 py-2.5 font-medium">
                  {r.client}
                </th>
                <td className="num px-3 py-2.5 text-right">{r.assigned}</td>
                <td className="num px-3 py-2.5 text-right">{r.done}</td>
                <td className="num px-3 py-2.5 text-right">{r.open}</td>
                <td className={`num px-3 py-2.5 text-right ${r.late > 0 ? "font-semibold text-danger" : ""}`}>{r.late}</td>
                <td className="num px-3 py-2.5 text-right font-semibold">{r.donePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">No task in this period has a client yet. Type a client name in the Client box when you assign a task.</p> : null}
      </GlassCard>
    </section>
  );
}
